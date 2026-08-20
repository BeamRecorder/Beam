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
    event_source::CGEventSourceStateID,
};
use foreign_types::ForeignType;

use crate::{
    CaptureError,
    cursor::mac::appkit::current_system_shape,
    cursor::{
        CaptureRegion, CursorEvent, CursorEventWriter, CursorRecordingPaths, finalize_after_worker,
        map_coordinates, move_sample_due,
    },
    input::{InputEvent, InputEventWriter, ShortcutSampler},
    model::SourceId,
    session::StartGate,
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
    shapes_path: PathBuf,
    input_partial_path: PathBuf,
    input_path: PathBuf,
}

impl MacCursorRecording {
    pub fn start(
        directory: &Path,
        region: CaptureRegion,
        capture_clicks: bool,
        capture_shortcuts: bool,
        segment_start_ns: u64,
        start_gate: Arc<StartGate>,
    ) -> Result<Self, CaptureError> {
        std::fs::create_dir_all(directory)
            .map_err(|error| CaptureError::storage(directory, error))?;
        let partial = directory.join("cursor.partial.jsonl");
        let final_path = directory.join("cursor.json");
        let telemetry_path = directory.join("telemetry.json");
        let shapes_path = directory.join("shapes.json");
        let input_partial_path = directory.join("input.partial.jsonl");
        let input_path = directory.join("input.json");
        let cancel = Arc::new(AtomicBool::new(false));
        let thread_cancel = cancel.clone();
        let metrics = Arc::new(MacCursorMetrics::default());
        let thread_metrics = metrics.clone();
        let thread_path = partial.clone();
        let thread_input_path = input_partial_path.clone();
        let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
        let thread = std::thread::Builder::new()
            .name("capture-macos-cursor".into())
            .spawn(move || {
                capture_loop(
                    &thread_path,
                    &thread_input_path,
                    region,
                    capture_clicks,
                    capture_shortcuts,
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
            shapes_path,
            input_partial_path,
            input_path,
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
            let worker_result = thread
                .join()
                .map_err(|_| CaptureError::Backend("macOS cursor thread panicked".into()))
                .and_then(|result| result);
            return finalize_after_worker(
                worker_result,
                CursorRecordingPaths {
                    partial: self.partial.clone(),
                    final_path: self.final_path.clone(),
                    telemetry: self.telemetry_path.clone(),
                    shapes: self.shapes_path.clone(),
                    input_partial: self.input_partial_path.clone(),
                    input: self.input_path.clone(),
                },
            );
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

#[allow(clippy::too_many_arguments)]
fn capture_loop(
    path: &Path,
    input_path: &Path,
    region: CaptureRegion,
    capture_clicks: bool,
    capture_shortcuts: bool,
    segment_start_ns: u64,
    cancel: &AtomicBool,
    metrics: &MacCursorMetrics,
    ready: &mpsc::SyncSender<Result<(), CaptureError>>,
    start_gate: &Arc<StartGate>,
) -> Result<(), CaptureError> {
    let mut writer = CursorEventWriter::open(path)?;
    let mut input_writer = InputEventWriter::open(input_path)?;
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
    let mut shortcuts = ShortcutSampler::default();
    let mut successful_samples = 0_u64;
    let mut last_sampling_error = None;
    while !cancel.load(Ordering::Acquire) {
        let session_ns = segment_start_ns
            .saturating_add(u64::try_from(started.elapsed().as_nanos()).unwrap_or(u64::MAX));
        let event = match current_cursor_event() {
            Ok(event) => {
                successful_samples = successful_samples.saturating_add(1);
                event
            }
            Err(error) => {
                metrics.interruptions.fetch_add(1, Ordering::Relaxed);
                last_sampling_error = Some(error.to_string());
                std::thread::sleep(Duration::from_millis(8));
                continue;
            }
        };
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
            previous_shape = Some(shape.cursor_id.clone());
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
                    let button = u8::try_from(index + 1).unwrap_or(u8::MAX);
                    push(
                        &mut writer,
                        metrics,
                        CursorEvent::Button {
                            session_ns,
                            button,
                            pressed,
                            normalized_x: position.normalized_x,
                            normalized_y: position.normalized_y,
                        },
                    )?;
                    input_writer.push(&InputEvent::MouseButton {
                        session_ns,
                        button,
                        pressed,
                    })?;
                    previous_buttons[index] = pressed;
                }
            }
        }
        if capture_shortcuts {
            for event in shortcuts.sample(
                session_ns,
                super::shortcut_modifier_pressed,
                super::shortcut_key_pressed,
            ) {
                input_writer.push(&event)?;
            }
        }
        std::thread::sleep(Duration::from_millis(8));
    }
    writer.flush()?;
    input_writer.flush()?;
    if successful_samples == 0
        && let Some(error) = last_sampling_error
    {
        return Err(CaptureError::Backend(format!(
            "macOS cursor sampling produced no samples; last error: {error}"
        )));
    }
    Ok(())
}

fn current_cursor_event() -> Result<CGEvent, CaptureError> {
    // A null source asks CoreGraphics for an event populated from the current
    // session state. Beam only reads its location and does not need to create a
    // synthetic event source first.
    // SAFETY: CGEventCreate accepts a nullable source. A non-null result follows
    // the Create rule and is transferred to CGEvent for release on drop.
    let event = unsafe { CGEventCreate(std::ptr::null_mut()) };
    if event.is_null() {
        Err(CaptureError::Backend("CGEventCreate failed".into()))
    } else {
        // SAFETY: event is a non-null owned CGEventRef returned by CGEventCreate.
        Ok(unsafe { CGEvent::from_ptr(event) })
    }
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
    fn CGEventCreate(
        source: core_graphics::sys::CGEventSourceRef,
    ) -> core_graphics::sys::CGEventRef;
    fn CGEventSourceButtonState(state: CGEventSourceStateID, button: CGMouseButton) -> bool;
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("macOS cursor capture failed: {error}"))
}
