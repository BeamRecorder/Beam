use std::{
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc,
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};

use core_graphics::{
    event::{CGEvent, CGMouseButton},
    event_source::{CGEventSource, CGEventSourceStateID},
};

use crate::{
    CaptureError,
    cursor::mac::appkit::current_system_shape,
    cursor::{
        CaptureRegion, CursorEvent, CursorEventWriter, CursorShapeCatalogEntry, map_coordinates,
        move_sample_due, telemetry_from_events,
    },
    model::SourceId,
    session::StartGate,
    storage::write_atomic,
};

#[derive(Debug, Default)]
pub struct MacCursorMetrics {
    events: AtomicU64,
    interruptions: AtomicU64,
}

impl MacCursorMetrics {
    #[must_use]
    pub fn events(&self) -> u64 {
        self.events.load(Ordering::Relaxed)
    }
    #[must_use]
    pub fn interruptions(&self) -> u64 {
        self.interruptions.load(Ordering::Relaxed)
    }
}

pub struct MacCursorRecording {
    cancel: Arc<AtomicBool>,
    thread: Option<JoinHandle<Result<(), CaptureError>>>,
    metrics: Arc<MacCursorMetrics>,
    partial: PathBuf,
    final_path: PathBuf,
    telemetry_path: PathBuf,
}

impl MacCursorRecording {
    pub fn start(
        directory: &Path,
        region: CaptureRegion,
        capture_clicks: bool,
        segment_start_ns: u64,
        start_gate: Arc<StartGate>,
    ) -> Result<Self, CaptureError> {
        std::fs::create_dir_all(directory)
            .map_err(|error| CaptureError::storage(directory, error))?;
        let partial = directory.join("cursor.partial.jsonl");
        let final_path = directory.join("cursor.json");
        let telemetry_path = directory.join("telemetry.json");
        let cancel = Arc::new(AtomicBool::new(false));
        let thread_cancel = cancel.clone();
        let metrics = Arc::new(MacCursorMetrics::default());
        let thread_metrics = metrics.clone();
        let thread_path = partial.clone();
        let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
        let thread = std::thread::Builder::new()
            .name("capture-macos-cursor".into())
            .spawn(move || {
                capture_loop(
                    &thread_path,
                    region,
                    capture_clicks,
                    segment_start_ns,
                    &thread_cancel,
                    &thread_metrics,
                    &ready_sender,
                    &start_gate,
                )
            })
            .map_err(backend_error)?;
        ready_receiver
            .recv()
            .map_err(|_| CaptureError::Backend("cursor startup channel closed".into()))??;
        Ok(Self {
            cancel,
            thread: Some(thread),
            metrics,
            partial,
            final_path,
            telemetry_path,
        })
    }

    pub fn stop(mut self) -> Result<(), CaptureError> {
        self.finish()
    }

    #[must_use]
    pub fn metrics(&self) -> Arc<MacCursorMetrics> {
        self.metrics.clone()
    }

    fn finish(&mut self) -> Result<(), CaptureError> {
        self.cancel.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            thread
                .join()
                .map_err(|_| CaptureError::Backend("macOS cursor thread panicked".into()))??;
            finalize(&self.partial, &self.final_path)?;
            finalize_telemetry(&self.final_path, &self.telemetry_path)?;
            finalize_shapes(
                &self.final_path,
                &self.final_path.with_file_name("shapes.json"),
            )?;
        }
        Ok(())
    }
}

pub fn source_region(source_id: &SourceId) -> Result<CaptureRegion, CaptureError> {
    let content =
        screencapturekit::shareable_content::SCShareableContent::get().map_err(backend_error)?;
    if let Some(id) = source_id.as_str().strip_prefix("sck:display:") {
        let id = id.parse::<u32>().map_err(backend_error)?;
        let display = content
            .displays()
            .into_iter()
            .find(|display| display.display_id() == id)
            .ok_or_else(|| CaptureError::SourceNotFound(source_id.to_string()))?;
        return region(display.frame());
    }
    if let Some(id) = source_id.as_str().strip_prefix("sck:window:") {
        let id = id.parse::<u32>().map_err(backend_error)?;
        let window = content
            .windows()
            .into_iter()
            .find(|window| window.window_id() == id)
            .ok_or_else(|| CaptureError::SourceNotFound(source_id.to_string()))?;
        return region(window.frame());
    }
    let display = content
        .displays()
        .into_iter()
        .find(|display| display.display_id() == core_graphics::display::CGDisplay::main().id)
        .or_else(|| content.displays().into_iter().next())
        .ok_or_else(|| CaptureError::SourceNotFound("main display".into()))?;
    region(display.frame())
}

fn region(rect: screencapturekit::cg::CGRect) -> Result<CaptureRegion, CaptureError> {
    Ok(CaptureRegion {
        x: coordinate(rect.origin.x),
        y: coordinate(rect.origin.y),
        width: dimension(rect.size.width),
        height: dimension(rect.size.height),
    })
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn dimension(value: f64) -> u32 {
    value.clamp(1.0, f64::from(u32::MAX)) as u32
}

impl Drop for MacCursorRecording {
    fn drop(&mut self) {
        let _result = self.finish();
    }
}

fn capture_loop(
    path: &Path,
    region: CaptureRegion,
    capture_clicks: bool,
    segment_start_ns: u64,
    cancel: &AtomicBool,
    metrics: &MacCursorMetrics,
    ready: &mpsc::SyncSender<Result<(), CaptureError>>,
    start_gate: &Arc<StartGate>,
) -> Result<(), CaptureError> {
    let mut writer = CursorEventWriter::open(path)?;
    ready
        .send(Ok(()))
        .map_err(|_| CaptureError::Backend("cursor startup receiver closed".into()))?;
    start_gate.wait()?;
    let started = Instant::now();
    let mut next_move_sample_ns = segment_start_ns;
    let mut previous_buttons = [false; 3];
    push(
        &mut writer,
        metrics,
        CursorEvent::Visibility {
            session_ns: segment_start_ns,
            visible: true,
        },
    )?;
    let mut previous_shape = None;
    while !cancel.load(Ordering::Acquire) {
        let session_ns = segment_start_ns
            .saturating_add(u64::try_from(started.elapsed().as_nanos()).unwrap_or(u64::MAX));
        let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState)
            .map_err(|_| CaptureError::Backend("CGEventSourceCreate failed".into()))?;
        let event = CGEvent::new(source)
            .map_err(|_| CaptureError::Backend("CGEventCreate failed".into()))?;
        let shape = current_system_shape();
        if previous_shape.as_ref() != Some(&shape.cursor_id) {
            push(
                &mut writer,
                metrics,
                CursorEvent::Shape {
                    session_ns,
                    cursor_id: shape.cursor_id.clone(),
                    cursor_kind: shape.cursor_kind,
                    native_cursor_id: shape.native_cursor_id,
                    hotspot: shape.hotspot,
                },
            )?;
            previous_shape = Some(shape.cursor_id);
        }
        let location = event.location();
        let x = coordinate(location.x);
        let y = coordinate(location.y);
        let position = map_coordinates(x, y, region)?;
        if move_sample_due(&mut next_move_sample_ns, session_ns) {
            push(
                &mut writer,
                metrics,
                CursorEvent::Move {
                    session_ns,
                    cursor_id: Some(shape.cursor_id.clone()),
                    pixel_x: position.pixel_x,
                    pixel_y: position.pixel_y,
                    normalized_x: position.normalized_x,
                    normalized_y: position.normalized_y,
                    visible: true,
                },
            )?;
        }
        if capture_clicks {
            for (index, button) in [
                CGMouseButton::Left,
                CGMouseButton::Right,
                CGMouseButton::Center,
            ]
            .into_iter()
            .enumerate()
            {
                let pressed = button_state(button);
                if previous_buttons[index] != pressed {
                    push(
                        &mut writer,
                        metrics,
                        CursorEvent::Button {
                            session_ns,
                            button: u8::try_from(index + 1).unwrap_or(u8::MAX),
                            pressed,
                            normalized_x: position.normalized_x,
                            normalized_y: position.normalized_y,
                        },
                    )?;
                    previous_buttons[index] = pressed;
                }
            }
        }
        std::thread::sleep(Duration::from_millis(8));
    }
    writer.flush()
}

fn push(
    writer: &mut CursorEventWriter,
    metrics: &MacCursorMetrics,
    event: CursorEvent,
) -> Result<(), CaptureError> {
    writer.push(event)?;
    metrics.events.fetch_add(1, Ordering::Relaxed);
    Ok(())
}

fn finalize(partial: &Path, destination: &Path) -> Result<(), CaptureError> {
    let contents =
        std::fs::read_to_string(partial).map_err(|error| CaptureError::storage(partial, error))?;
    let events = contents
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(serde_json::from_str::<CursorEvent>)
        .collect::<Result<Vec<_>, _>>()?;
    write_atomic(destination, &serde_json::to_vec_pretty(&events)?)
}

fn finalize_telemetry(cursor_path: &Path, destination: &Path) -> Result<(), CaptureError> {
    let events: Vec<CursorEvent> = serde_json::from_slice(
        &std::fs::read(cursor_path).map_err(|error| CaptureError::storage(cursor_path, error))?,
    )?;
    write_atomic(
        destination,
        &serde_json::to_vec_pretty(&telemetry_from_events(&events))?,
    )
}

fn finalize_shapes(cursor_path: &Path, destination: &Path) -> Result<(), CaptureError> {
    let events: Vec<CursorEvent> = serde_json::from_slice(
        &std::fs::read(cursor_path).map_err(|error| CaptureError::storage(cursor_path, error))?,
    )?;
    let shapes = events
        .into_iter()
        .filter_map(|event| match event {
            CursorEvent::Shape {
                cursor_id,
                cursor_kind,
                native_cursor_id,
                hotspot,
                ..
            } => Some((
                cursor_id,
                CursorShapeCatalogEntry {
                    cursor_kind,
                    native_cursor_id,
                    hotspot,
                },
            )),
            _ => None,
        })
        .collect::<std::collections::BTreeMap<_, _>>();
    write_atomic(destination, &serde_json::to_vec_pretty(&shapes)?)
}

#[allow(clippy::cast_possible_truncation)]
fn coordinate(value: f64) -> i32 {
    value.clamp(f64::from(i32::MIN), f64::from(i32::MAX)) as i32
}

fn button_state(button: CGMouseButton) -> bool {
    // SAFETY: CoreGraphics accepts these value enums and reads no caller-owned memory.
    unsafe { CGEventSourceButtonState(CGEventSourceStateID::CombinedSessionState, button) }
}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGEventSourceButtonState(state: CGEventSourceStateID, button: CGMouseButton) -> bool;
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("macOS cursor capture failed: {error}"))
}
