//! Paced native X11 acquisition through the existing screen sample contract.

use super::{Selection, backend_error, reader::Reader};
use crate::{
    CaptureError,
    gate::StartGate,
    model::ScreenSelection,
    screen::{
        FrameTimestamp, OwnedScreenSample, ScreenCaptureMetrics, ScreenConsumer, ScreenOpenRequest,
        ScreenSegment, TimestampSource, VideoFormat,
    },
};
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Sender},
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};

pub(crate) struct X11Recording {
    commands: Sender<Command>,
    worker: Option<JoinHandle<Result<(), CaptureError>>>,
    available: Arc<AtomicBool>,
    metrics: Arc<ScreenCaptureMetrics>,
}

enum Command {
    Start,
    Pause,
    Resume {
        start_ns: u64,
        gate: Arc<StartGate>,
        segment: Option<ScreenSegment>,
    },
    Stop,
}

impl X11Recording {
    /// Opens the selected drawable and starts an idle acquisition worker.
    pub(crate) fn open(request: ScreenOpenRequest<'_>) -> Result<Self, CaptureError> {
        let ScreenSelection::Source { source_id } = request.selection else {
            return Err(CaptureError::InvalidConfiguration(
                "X11 capture needs a resolved source".into(),
            ));
        };
        let selection = Selection::parse(source_id.as_str())?;
        if request.recording.target_fps == 0 || request.recording.target_fps > 240 {
            return Err(CaptureError::InvalidConfiguration(
                "screen fps must be 1–240".into(),
            ));
        }
        if let Some(region) = request.region {
            region.validate()?
        }
        let mut reader = Reader::open(selection, request.region)?;
        let ScreenConsumer::Samples(mut sink) = request.consumer;
        let (commands, receiver) = mpsc::channel();
        let available = Arc::new(AtomicBool::new(true));
        let worker_available = Arc::clone(&available);
        let metrics = Arc::new(ScreenCaptureMetrics::default());
        let worker_metrics = Arc::clone(&metrics);
        let interval = Duration::from_secs_f64(1.0 / f64::from(request.recording.target_fps));
        let cursor = request.cursor;
        let mut gate = request.start_gate;
        let mut start_ns = request.start_ns;
        let worker = std::thread::Builder::new()
            .name("beam-x11-capture".into())
            .spawn(move || {
                let result = (|| {
                    let mut capturing = false;
                    let mut first = Instant::now();
                    let mut sequence = 0;
                    let mut format = None;
                    let mut deadline = Instant::now();
                    loop {
                        let wait = if capturing {
                            deadline.saturating_duration_since(Instant::now())
                        } else {
                            Duration::from_secs(30)
                        };
                        match receiver.recv_timeout(wait) {
                            Ok(Command::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                            Ok(Command::Start) => {
                                capturing = true;
                                first = Instant::now();
                                deadline = first
                            }
                            Ok(Command::Pause) => {
                                capturing = false;
                                sink.end_segment()?;
                                continue;
                            }
                            Ok(Command::Resume {
                                start_ns: next,
                                gate: next_gate,
                                segment,
                            }) => {
                                start_ns = next;
                                gate = next_gate;
                                if let Some(segment) = segment {
                                    sink.begin_segment(segment)?
                                }
                                capturing = false;
                                continue;
                            }
                            Err(mpsc::RecvTimeoutError::Timeout) => {}
                        }
                        if !capturing {
                            continue;
                        }
                        deadline += interval;
                        if deadline < Instant::now() {
                            deadline = Instant::now() + interval;
                        }
                        if !gate.is_released() {
                            continue;
                        }
                        let (frame, cursor) = reader.frame(cursor)?;
                        let current = VideoFormat {
                            width: frame.width,
                            height: frame.height,
                            stride: frame.stride,
                            pixel_format: frame.pixel_format,
                        };
                        if format != Some(current) {
                            sink.format_changed(current)?;
                            worker_metrics.observe_video_format(current);
                            worker_metrics.changed_format();
                            format = Some(current);
                        }
                        let elapsed =
                            u64::try_from(first.elapsed().as_nanos()).map_err(backend_error)?;
                        let session_ns = start_ns.saturating_add(elapsed);
                        worker_metrics.received_frame(
                            None,
                            !matches!(cursor, crate::screen::CursorSampleState::Unknown),
                        );
                        sink.push(OwnedScreenSample {
                            frame,
                            cursor,
                            sequence,
                            timestamp: FrameTimestamp {
                                session_ns,
                                native_pts_ns: None,
                                source: TimestampSource::MonotonicArrival,
                            },
                        })?;
                        sequence += 1;
                    }
                    Ok(())
                })();
                worker_available.store(false, Ordering::Release);
                let finished = sink.finish();
                result.and(finished)
            })
            .map_err(backend_error)?;
        Ok(Self {
            commands,
            worker: Some(worker),
            available,
            metrics,
        })
    }

    pub(crate) fn start(&mut self) -> Result<(), CaptureError> {
        self.commands.send(Command::Start).map_err(backend_error)
    }
    pub(crate) fn pause(&mut self) -> Result<(), CaptureError> {
        self.commands.send(Command::Pause).map_err(backend_error)
    }
    pub(crate) fn prepare_resume(
        &mut self,
        start_ns: u64,
        gate: Arc<StartGate>,
        segment: Option<ScreenSegment>,
    ) -> Result<(), CaptureError> {
        self.commands
            .send(Command::Resume {
                start_ns,
                gate,
                segment,
            })
            .map_err(backend_error)
    }
    pub(crate) fn stop(&mut self) -> Result<(), CaptureError> {
        let Some(worker) = self.worker.take() else {
            return Ok(());
        };
        let _ = self.commands.send(Command::Stop);
        worker
            .join()
            .map_err(|_| backend_error("capture worker panicked"))?
    }
    pub(crate) fn is_available(&self) -> bool {
        self.available.load(Ordering::Acquire)
    }
    pub(crate) fn metrics(&self) -> Arc<ScreenCaptureMetrics> {
        Arc::clone(&self.metrics)
    }
    pub(crate) fn video_format(&self) -> Option<VideoFormat> {
        self.metrics.first_video_format()
    }
}

impl Drop for X11Recording {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

#[path = "../../../../test/screen/linux/x11/capture.rs"]
mod checks;
