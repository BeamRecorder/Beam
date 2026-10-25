use std::{
    path::Path,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc,
    },
    thread::JoinHandle,
    time::Duration,
};

use core_graphics::event::CGEvent;
use foreign_types::ForeignType;

use crate::{
    CaptureError,
    cursor::{CaptureRegion, CursorEvent, CursorEventWriter, map_coordinates, move_sample_due},
    input::{InputEvent, InputEventWriter, ShortcutSampler},
    model::{CursorSelection, SourceId},
    session::StartGate,
};

#[derive(Debug)]
pub struct MacCursorMetrics {
    events: AtomicU64,
    interruptions: AtomicU64,
    shape_source: super::MacCursorShapeSource,
    shape_failure_baseline: u64,
    input_failure: Mutex<Option<String>>,
}

impl MacCursorMetrics {
    fn new(shape_source: super::MacCursorShapeSource) -> Self {
        let shape_failure_baseline = shape_source.failures();
        Self {
            events: AtomicU64::new(0),
            interruptions: AtomicU64::new(0),
            shape_source,
            shape_failure_baseline,
            input_failure: Mutex::new(None),
        }
    }

    #[must_use]
    pub fn events(&self) -> u64 {
        self.events.load(Ordering::Relaxed)
    }
    #[must_use]
    pub fn interruptions(&self) -> u64 {
        self.interruptions.load(Ordering::Relaxed).saturating_add(
            self.shape_source
                .failures()
                .saturating_sub(self.shape_failure_baseline),
        )
    }

    pub fn failure_reason(&self) -> Option<String> {
        self.input_failure
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    pub(super) fn record_input_failure(&self, message: String) {
        let mut failure = self
            .input_failure
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if failure.is_none() {
            *failure = Some(message);
            self.interruptions.fetch_add(1, Ordering::Relaxed);
        }
    }
}

pub struct MacCursorRecording {
    cancel: Arc<AtomicBool>,
    thread: Option<JoinHandle<Result<(), CaptureError>>>,
    metrics: Arc<MacCursorMetrics>,
    start_gate: Arc<StartGate>,
}

impl MacCursorRecording {
    pub(crate) fn start(
        directory: &Path,
        region: CaptureRegion,
        selection: CursorSelection,
        shape_source: super::MacCursorShapeSource,
        segment_start_ns: u64,
        start_gate: Arc<StartGate>,
    ) -> Result<Self, CaptureError> {
        let CursorSelection::Separate {
            capture_clicks,
            capture_shortcuts,
            capture_shape,
        } = selection
        else {
            return Err(CaptureError::InvalidConfiguration(
                "macOS cursor recording requires separate cursor mode".into(),
            ));
        };
        std::fs::create_dir_all(directory)
            .map_err(|error| CaptureError::storage(directory, error))?;
        let partial = directory.join("cursor.partial.jsonl");
        let input_partial_path = directory.join("input.partial.jsonl");
        let cancel = Arc::new(AtomicBool::new(false));
        let thread_cancel = cancel.clone();
        let metrics = Arc::new(MacCursorMetrics::new(shape_source.clone()));
        let thread_metrics = metrics.clone();
        let thread_path = partial.clone();
        let thread_input_path = input_partial_path.clone();
        let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
        let permit = crate::cursor::CursorWorkerPermit::acquire()?;
        let worker_gate = start_gate.clone();
        let thread = std::thread::Builder::new()
            .name("capture-macos-cursor".into())
            .spawn(move || {
                let _permit = permit;
                let result = capture_loop(
                    &thread_path,
                    &thread_input_path,
                    region,
                    capture_clicks,
                    capture_shortcuts,
                    capture_shape,
                    shape_source,
                    segment_start_ns,
                    &thread_cancel,
                    &thread_metrics,
                    &ready_sender,
                    &worker_gate,
                );
                if let Err(error) = &result {
                    thread_metrics.record_input_failure(error.to_string());
                }
                result
            })
            .map_err(backend_error)?;
        let ready = ready_receiver
            .recv_timeout(Duration::from_secs(2))
            .map_err(|_| {
                CaptureError::Backend("cursor startup did not finish within 2 seconds".into())
            })
            .and_then(|result| result);
        if let Err(error) = ready {
            cancel.store(true, Ordering::Release);
            start_gate.cancel();
            let _ = crate::session::join_worker(thread, "cursor startup");
            return Err(error);
        }
        Ok(Self {
            cancel,
            thread: Some(thread),
            metrics,
            start_gate,
        })
    }

    pub fn stop(mut self) -> Result<(), CaptureError> {
        self.finish()
    }

    pub(crate) fn request_stop(&self) {
        self.cancel.store(true, Ordering::Release);
        self.start_gate.cancel();
    }

    #[must_use]
    pub fn metrics(&self) -> Arc<MacCursorMetrics> {
        self.metrics.clone()
    }

    fn finish(&mut self) -> Result<(), CaptureError> {
        self.cancel.store(true, Ordering::Release);
        self.start_gate.cancel();
        if let Some(thread) = self.thread.take() {
            return crate::session::join_worker(thread, "cursor capture");
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
    capture_shape: bool,
    shape_source: super::MacCursorShapeSource,
    segment_start_ns: u64,
    cancel: &AtomicBool,
    metrics: &Arc<MacCursorMetrics>,
    ready: &mpsc::SyncSender<Result<(), CaptureError>>,
    start_gate: &Arc<StartGate>,
) -> Result<(), CaptureError> {
    let mut writer = CursorEventWriter::open(path)?;
    let mut input_writer = InputEventWriter::open(input_path)?;
    let buttons = if capture_clicks {
        match super::buttons::MacButtonCapture::open(region, start_gate.clone(), metrics.clone()) {
            Ok(buttons) => Some(buttons),
            Err(error) => {
                let _sent = ready.send(Err(error));
                return Ok(());
            }
        }
    } else {
        None
    };
    ready
        .send(Ok(()))
        .map_err(|_| CaptureError::Backend("cursor startup receiver closed".into()))?;
    start_gate.wait()?;
    if let Some(buttons) = &buttons {
        buttons.start()?;
    }
    let mut next_move_sample_ns = segment_start_ns;
    push(
        &mut writer,
        metrics,
        CursorEvent::Visibility {
            session_ns: start_gate.session_time_ns()?,
            visible: true,
        },
    )?;
    let mut previous_shape = None;
    let mut shortcuts = ShortcutSampler::default();
    let mut successful_samples = 0_u64;
    let mut last_sampling_error = None;
    while !cancel.load(Ordering::Acquire) {
        flush_buttons(buttons.as_ref(), &mut writer, &mut input_writer, metrics)?;
        if buttons.is_some()
            && let Some(reason) = metrics.failure_reason()
        {
            return Err(CaptureError::Backend(reason));
        }
        let session_ns = start_gate.session_time_ns()?;
        let event = match current_cursor_event() {
            Ok(event) => {
                successful_samples = successful_samples.saturating_add(1);
                event
            }
            Err(error) => {
                metrics.interruptions.fetch_add(1, Ordering::Relaxed);
                last_sampling_error = Some(error.to_string());
                wait_for_events(buttons.as_ref());
                continue;
            }
        };
        let cursor_id = if capture_shape {
            let shape = shape_source.current();
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
            Some(shape.cursor_id)
        } else {
            None
        };
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
                    cursor_id: cursor_id.clone(),
                    pixel_x: position.pixel_x,
                    pixel_y: position.pixel_y,
                    normalized_x: position.normalized_x,
                    normalized_y: position.normalized_y,
                    visible: true,
                },
            )?;
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
        wait_for_events(buttons.as_ref());
    }
    if let Some(buttons) = &buttons {
        buttons.stop();
    }
    flush_buttons(buttons.as_ref(), &mut writer, &mut input_writer, metrics)?;
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
pub(super) fn coordinate(value: f64) -> i32 {
    value.clamp(f64::from(i32::MIN), f64::from(i32::MAX)) as i32
}

fn wait_for_events(buttons: Option<&super::buttons::MacButtonCapture>) {
    if let Some(buttons) = buttons {
        buttons.poll();
    } else {
        std::thread::sleep(Duration::from_millis(8));
    }
}

fn flush_buttons(
    buttons: Option<&super::buttons::MacButtonCapture>,
    writer: &mut CursorEventWriter,
    input_writer: &mut InputEventWriter,
    metrics: &MacCursorMetrics,
) -> Result<(), CaptureError> {
    if let Some(buttons) = buttons {
        for event in buttons.events() {
            if let CursorEvent::Button {
                session_ns,
                button,
                pressed,
                ..
            } = &event
            {
                input_writer.push(&InputEvent::MouseButton {
                    session_ns: *session_ns,
                    button: *button,
                    pressed: *pressed,
                })?;
            }
            push(writer, metrics, event)?;
        }
    }
    Ok(())
}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGEventCreate(
        source: core_graphics::sys::CGEventSourceRef,
    ) -> core_graphics::sys::CGEventRef;
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("macOS cursor capture failed: {error}"))
}

#[cfg(test)]
#[path = "recording_metrics_tests.rs"]
mod tests;
