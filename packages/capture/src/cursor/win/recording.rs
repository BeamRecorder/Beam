use std::{
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc,
    },
    thread::JoinHandle,
    time::Duration,
};

use crate::{
    CaptureError,
    cursor::{CursorEvent, CursorEventWriter, move_sample_due},
    input::{InputEvent, InputEventWriter, ShortcutSampler},
    session::StartGate,
};

use super::{WindowsCursorRecordingConfig, WindowsCursorSourceContext};
use super::{capture::sample_cursor_cached, shape_cache::ShapeCache};
use super::{shortcut_key_pressed, shortcut_modifier_pressed};

#[derive(Debug, Default)]
pub struct CursorCaptureMetrics {
    events: AtomicU64,
    interruptions: AtomicU64,
    failure: std::sync::Mutex<Option<String>>,
}

impl CursorCaptureMetrics {
    #[must_use]
    pub fn events(&self) -> u64 {
        self.events.load(Ordering::Relaxed)
    }

    #[must_use]
    pub fn failure_reason(&self) -> Option<String> {
        self.failure
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    #[must_use]
    pub fn interruptions(&self) -> u64 {
        self.interruptions.load(Ordering::Relaxed)
    }
}

pub struct WindowsCursorRecording {
    cancel: Arc<AtomicBool>,
    thread: Option<JoinHandle<Result<(), CaptureError>>>,
    metrics: Arc<CursorCaptureMetrics>,
    start_gate: Arc<StartGate>,
}

impl WindowsCursorRecording {
    pub fn start(
        directory: &Path,
        source: WindowsCursorSourceContext,
        config: WindowsCursorRecordingConfig,
    ) -> Result<Self, CaptureError> {
        let WindowsCursorRecordingConfig {
            capture_clicks,
            capture_shortcuts,
            capture_shape,
            segment_start_ns,
            start_gate,
            screen_metrics,
        } = config;
        std::fs::create_dir_all(directory)
            .map_err(|error| CaptureError::storage(directory, error))?;
        let partial_path = directory.join("cursor.partial.jsonl");
        let input_partial_path = directory.join("input.partial.jsonl");
        let cancel = Arc::new(AtomicBool::new(false));
        let thread_cancel = cancel.clone();
        let metrics = Arc::new(CursorCaptureMetrics::default());
        let thread_metrics = metrics.clone();
        let thread_partial = partial_path.clone();
        let thread_input_partial = input_partial_path.clone();
        let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
        let permit = crate::cursor::CursorWorkerPermit::acquire()?;
        let worker_gate = start_gate.clone();
        let thread = std::thread::Builder::new()
            .name("capture-windows-cursor".into())
            .spawn(move || {
                let _permit = permit;
                let result = capture_loop(
                    &thread_partial,
                    &thread_input_partial,
                    source,
                    capture_clicks,
                    capture_shortcuts,
                    capture_shape,
                    segment_start_ns,
                    &thread_cancel,
                    &thread_metrics,
                    &ready_sender,
                    &worker_gate,
                    &screen_metrics,
                );
                if let Err(error) = &result {
                    *thread_metrics
                        .failure
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner) =
                        Some(error.to_string());
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
    pub fn metrics(&self) -> Arc<CursorCaptureMetrics> {
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

impl Drop for WindowsCursorRecording {
    fn drop(&mut self) {
        let _result = self.finish();
    }
}

#[derive(Default)]
struct Previous {
    visible: Option<bool>,
    buttons: [bool; 3],
    shape: Option<usize>,
}

#[allow(clippy::too_many_arguments)]
fn capture_loop(
    partial_path: &Path,
    input_partial_path: &Path,
    mut source: WindowsCursorSourceContext,
    capture_clicks: bool,
    capture_shortcuts: bool,
    capture_shape: bool,
    segment_start_ns: u64,
    cancel: &AtomicBool,
    metrics: &CursorCaptureMetrics,
    ready: &mpsc::SyncSender<Result<(), CaptureError>>,
    start_gate: &Arc<StartGate>,
    screen_metrics: &crate::screen::ScreenCaptureMetrics,
) -> Result<(), CaptureError> {
    let mut writer = CursorEventWriter::open(partial_path)?;
    let mut input_writer = InputEventWriter::open(input_partial_path)?;
    ready
        .send(Ok(()))
        .map_err(|_| CaptureError::Backend("cursor startup receiver closed".into()))?;
    start_gate.wait()?;
    if let Some(display_scale_factor) = source.display_scale_factor {
        writer.push(CursorEvent::Metadata {
            session_ns: start_gate.session_time_ns()?,
            display_scale_factor,
        })?;
    }
    let mut previous = Previous::default();
    let mut next_move_sample_ns = segment_start_ns;
    let mut shortcuts = ShortcutSampler::default();
    let mut shapes = ShapeCache::default();
    let _physical = super::dpi::PhysicalCoordinates::enter()?;
    let fallback_size = (
        source.region.width.max(2) & !1,
        source.region.height.max(2) & !1,
    );
    while !cancel.load(Ordering::Acquire) {
        let session_ns = start_gate.session_time_ns()?;
        if let Some(handle) = source.window_handle {
            match super::capture::window_context(handle) {
                Ok(context) => {
                    if context.region != source.region {
                        push(
                            &mut writer,
                            metrics,
                            CursorEvent::CropChanged {
                                session_ns,
                                x: context.region.x,
                                y: context.region.y,
                                width: context.region.width,
                                height: context.region.height,
                            },
                        )?;
                    }
                    if context.display_scale_factor != source.display_scale_factor
                        && let Some(display_scale_factor) = context.display_scale_factor
                    {
                        push(
                            &mut writer,
                            metrics,
                            CursorEvent::Metadata {
                                session_ns,
                                display_scale_factor,
                            },
                        )?;
                    }
                    source = context;
                }
                Err(error) => {
                    metrics.interruptions.fetch_add(1, Ordering::Relaxed);
                    return Err(error);
                }
            }
        }
        match sample_cursor_cached(source.region, capture_shape, &mut shapes) {
            Ok(mut sample) => {
                if source.window_handle.is_some() {
                    let size = screen_metrics
                        .first_video_format()
                        .map_or(fallback_size, |format| (format.width, format.height));
                    sample.position = crate::cursor::map_aspect_fit(
                        sample.position,
                        source.region,
                        size.0,
                        size.1,
                    )?;
                }
                if move_sample_due(&mut next_move_sample_ns, session_ns) {
                    push(
                        &mut writer,
                        metrics,
                        CursorEvent::Move {
                            session_ns,
                            cursor_id: sample
                                .shape
                                .as_ref()
                                .map(|shape| format!("win:{:x}", shape.native_id)),
                            pixel_x: sample.position.pixel_x,
                            pixel_y: sample.position.pixel_y,
                            normalized_x: sample.position.normalized_x,
                            normalized_y: sample.position.normalized_y,
                            visible: sample.visible,
                        },
                    )?;
                }
                if previous.visible != Some(sample.visible) {
                    push(
                        &mut writer,
                        metrics,
                        CursorEvent::Visibility {
                            session_ns,
                            visible: sample.visible,
                        },
                    )?;
                    previous.visible = Some(sample.visible);
                }
                if capture_clicks {
                    for (button, pressed) in [
                        sample.left_pressed,
                        sample.right_pressed,
                        sample.middle_pressed,
                    ]
                    .into_iter()
                    .enumerate()
                    {
                        if previous.buttons[button] != pressed {
                            let button = u8::try_from(button + 1).unwrap_or(u8::MAX);
                            push(
                                &mut writer,
                                metrics,
                                CursorEvent::Button {
                                    session_ns,
                                    button,
                                    pressed,
                                    normalized_x: sample.position.normalized_x,
                                    normalized_y: sample.position.normalized_y,
                                },
                            )?;
                            input_writer.push(&InputEvent::MouseButton {
                                session_ns,
                                button,
                                pressed,
                            })?;
                            previous.buttons[usize::from(button.saturating_sub(1))] = pressed;
                        }
                    }
                }
                if let Some(shape) = sample.shape
                    && previous.shape != Some(shape.native_id)
                {
                    let hotspot = shape.hotspot;
                    let native_cursor_id = format!("win:{:x}", shape.native_id);
                    push(
                        &mut writer,
                        metrics,
                        CursorEvent::Shape {
                            session_ns,
                            cursor_id: native_cursor_id.clone(),
                            cursor_kind: shape.cursor_kind,
                            native_cursor_id,
                            hotspot,
                        },
                    )?;
                    previous.shape = Some(shape.native_id);
                }
            }
            Err(error) => {
                metrics.interruptions.fetch_add(1, Ordering::Relaxed);
                *metrics
                    .failure
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(error.to_string());
            }
        }
        if capture_shortcuts {
            for event in
                shortcuts.sample(session_ns, shortcut_modifier_pressed, shortcut_key_pressed)
            {
                input_writer.push(&event)?;
            }
        }
        std::thread::sleep(Duration::from_millis(8));
    }
    writer.flush()?;
    input_writer.flush()
}

fn push(
    writer: &mut CursorEventWriter,
    metrics: &CursorCaptureMetrics,
    event: CursorEvent,
) -> Result<(), CaptureError> {
    writer.push(event)?;
    metrics.events.fetch_add(1, Ordering::Relaxed);
    Ok(())
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("cursor recording failed: {error}"))
}
