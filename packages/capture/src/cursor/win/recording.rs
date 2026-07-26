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

use crate::{
    CaptureError,
    cursor::{
        CURSOR_SAMPLE_INTERVAL_NS, CaptureRegion, CursorEvent, CursorEventWriter,
        CursorShapeCatalogEntry, telemetry_from_events,
    },
    session::StartGate,
    storage::write_atomic,
};

use super::sample_cursor;

#[derive(Debug, Default)]
pub struct CursorCaptureMetrics {
    events: AtomicU64,
    interruptions: AtomicU64,
}

impl CursorCaptureMetrics {
    #[must_use]
    pub fn events(&self) -> u64 {
        self.events.load(Ordering::Relaxed)
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
    partial_path: PathBuf,
    final_path: PathBuf,
    shapes_path: PathBuf,
    telemetry_path: PathBuf,
}

impl WindowsCursorRecording {
    pub fn start(
        directory: &Path,
        region: CaptureRegion,
        capture_clicks: bool,
        capture_shape: bool,
        segment_start_ns: u64,
        start_gate: Arc<StartGate>,
    ) -> Result<Self, CaptureError> {
        std::fs::create_dir_all(directory)
            .map_err(|error| CaptureError::storage(directory, error))?;
        let partial_path = directory.join("cursor.partial.jsonl");
        let final_path = directory.join("cursor.json");
        let shapes_path = directory.join("shapes.json");
        let telemetry_path = directory.join("telemetry.json");
        let cancel = Arc::new(AtomicBool::new(false));
        let thread_cancel = cancel.clone();
        let metrics = Arc::new(CursorCaptureMetrics::default());
        let thread_metrics = metrics.clone();
        let thread_partial = partial_path.clone();
        let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
        let thread = std::thread::Builder::new()
            .name("capture-windows-cursor".into())
            .spawn(move || {
                capture_loop(
                    &thread_partial,
                    region,
                    capture_clicks,
                    capture_shape,
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
            partial_path,
            final_path,
            shapes_path,
            telemetry_path,
        })
    }

    pub fn stop(mut self) -> Result<(), CaptureError> {
        self.finish()
    }

    #[must_use]
    pub fn metrics(&self) -> Arc<CursorCaptureMetrics> {
        self.metrics.clone()
    }

    fn finish(&mut self) -> Result<(), CaptureError> {
        self.cancel.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            thread
                .join()
                .map_err(|_| CaptureError::Backend("cursor capture thread panicked".into()))??;
            finalize_events(&self.partial_path, &self.final_path)?;
            finalize_telemetry(&self.final_path, &self.telemetry_path)?;
            finalize_shapes(&self.final_path, &self.shapes_path)?;
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
    position: Option<(i32, i32)>,
    visible: Option<bool>,
    buttons: [bool; 3],
    shape: Option<usize>,
    last_sample_ns: Option<u64>,
}

#[allow(clippy::too_many_arguments)]
fn capture_loop(
    partial_path: &Path,
    region: CaptureRegion,
    capture_clicks: bool,
    capture_shape: bool,
    segment_start_ns: u64,
    cancel: &AtomicBool,
    metrics: &CursorCaptureMetrics,
    ready: &mpsc::SyncSender<Result<(), CaptureError>>,
    start_gate: &Arc<StartGate>,
) -> Result<(), CaptureError> {
    let mut writer = CursorEventWriter::open(partial_path)?;
    ready
        .send(Ok(()))
        .map_err(|_| CaptureError::Backend("cursor startup receiver closed".into()))?;
    start_gate.wait()?;
    let started = Instant::now();
    let mut previous = Previous::default();
    while !cancel.load(Ordering::Acquire) {
        let session_ns = segment_start_ns
            .saturating_add(u64::try_from(started.elapsed().as_nanos()).unwrap_or(u64::MAX));
        match sample_cursor(region, capture_shape) {
            Ok(sample) => {
                if previous.position != Some((sample.position.pixel_x, sample.position.pixel_y))
                    || previous.last_sample_ns.is_none_or(|last| {
                        session_ns.saturating_sub(last) >= CURSOR_SAMPLE_INTERVAL_NS
                    })
                {
                    push(
                        &mut writer,
                        metrics,
                        CursorEvent::Move {
                            session_ns,
                            pixel_x: sample.position.pixel_x,
                            pixel_y: sample.position.pixel_y,
                            normalized_x: sample.position.normalized_x,
                            normalized_y: sample.position.normalized_y,
                            visible: sample.visible,
                        },
                    )?;
                    previous.position = Some((sample.position.pixel_x, sample.position.pixel_y));
                    previous.last_sample_ns = Some(session_ns);
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
                            push(
                                &mut writer,
                                metrics,
                                CursorEvent::Button {
                                    session_ns,
                                    button: u8::try_from(button + 1).unwrap_or(u8::MAX),
                                    pressed,
                                },
                            )?;
                            previous.buttons[button] = pressed;
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
            Err(_) => {
                metrics.interruptions.fetch_add(1, Ordering::Relaxed);
            }
        }
        std::thread::sleep(Duration::from_millis(8));
    }
    writer.flush()
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

fn finalize_events(partial: &Path, destination: &Path) -> Result<(), CaptureError> {
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

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("cursor recording failed: {error}"))
}
