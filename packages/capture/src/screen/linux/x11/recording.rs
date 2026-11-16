use super::{Reader, connection::error};
use crate::{
    CaptureError,
    model::{CursorSelection, RecordingSettings, ScreenRegion, SourceId},
    screen::{
        FrameTimestamp, OwnedScreenSample, ScreenCaptureMetrics, ScreenSampleSink, ScreenSegment,
        TimestampSource, VideoFormat,
    },
    session::StartGate,
};
use std::{
    sync::{Arc, mpsc},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

pub(crate) struct Request<'a> {
    pub source: &'a SourceId,
    pub region: Option<ScreenRegion>,
    pub settings: &'a RecordingSettings,
    pub sink: Box<dyn ScreenSampleSink>,
    pub gate: Arc<StartGate>,
    pub cursor: CursorSelection,
    pub show_real_cursor: bool,
    pub metrics: Arc<ScreenCaptureMetrics>,
    pub encode: bool,
}
enum Command {
    Start(Arc<StartGate>, mpsc::SyncSender<Result<(), CaptureError>>),
    Pause(mpsc::SyncSender<Result<(), CaptureError>>),
    Segment(ScreenSegment, mpsc::SyncSender<Result<(), CaptureError>>),
    Stop,
}
pub(crate) struct X11Recording {
    commands: Option<mpsc::Sender<Command>>,
    worker: Option<JoinHandle<Result<(), CaptureError>>>,
    gate: Arc<StartGate>,
    format: VideoFormat,
}
impl X11Recording {
    pub(crate) fn prepare(request: Request<'_>) -> Result<Self, CaptureError> {
        let reader = Reader::open(request.source, request.region, request.encode)?;
        let format = reader.format();
        let period = Duration::from_secs_f64(1.0 / f64::from(request.settings.target_fps.max(1)));
        let gate = request.gate.clone();
        let (commands, receiver) = mpsc::channel();
        let (ready_sender, ready) = mpsc::sync_channel(1);
        let mut sink = request.sink;
        let metrics = request.metrics;
        let track_cursor = matches!(request.cursor, CursorSelection::Separate { .. });
        let show_cursor =
            request.show_real_cursor || matches!(request.cursor, CursorSelection::Embedded);
        let worker = thread::Builder::new()
            .name("beam-linux-x11".into())
            .spawn(move || {
                let initialized = sink.format_changed(format);
                if let Err(failure) = initialized {
                    let _ = ready_sender.send(Err(failure));
                    return sink.finish();
                }
                metrics.observe_video_format(format);
                let _ = ready_sender.send(Ok(()));
                let result = run(
                    reader,
                    &mut *sink,
                    receiver,
                    period,
                    track_cursor,
                    show_cursor,
                    &metrics,
                );
                let finished = sink.finish();
                result.and(finished)
            })
            .map_err(error)?;
        let mut recording = Self {
            commands: Some(commands),
            worker: Some(worker),
            gate,
            format,
        };
        match ready
            .recv_timeout(Duration::from_secs(15))
            .map_err(error)
            .and_then(|result| result)
        {
            Ok(()) => Ok(recording),
            Err(failure) => {
                let _ = recording.stop();
                Err(failure)
            }
        }
    }
    fn send(
        &self,
        command: impl FnOnce(mpsc::SyncSender<Result<(), CaptureError>>) -> Command,
    ) -> Result<(), CaptureError> {
        let (reply, receiver) = mpsc::sync_channel(1);
        self.commands
            .as_ref()
            .ok_or_else(|| error("Capture has stopped"))?
            .send(command(reply))
            .map_err(error)?;
        receiver
            .recv_timeout(Duration::from_secs(15))
            .map_err(error)?
    }
    pub(crate) fn start(&mut self) -> Result<(), CaptureError> {
        if !self.gate.is_released() {
            return Err(error("The recording start gate is not released"));
        }
        self.send(|reply| Command::Start(self.gate.clone(), reply))
    }
    pub(crate) fn pause(&mut self) -> Result<(), CaptureError> {
        self.send(Command::Pause)
    }
    pub(crate) fn prepare_resume(
        &mut self,
        gate: Arc<StartGate>,
        segment: Option<ScreenSegment>,
    ) -> Result<(), CaptureError> {
        if let Some(segment) = segment {
            self.send(|reply| Command::Segment(segment, reply))?;
        }
        self.gate = gate;
        Ok(())
    }
    pub(crate) fn stop(&mut self) -> Result<(), CaptureError> {
        if let Some(sender) = self.commands.take() {
            let _ = sender.send(Command::Stop);
        }
        self.worker.take().map_or(Ok(()), |worker| {
            worker
                .join()
                .map_err(|_| error("Capture worker panicked"))?
        })
    }
    pub(crate) fn is_available(&self) -> bool {
        self.worker
            .as_ref()
            .is_none_or(|worker| !worker.is_finished())
    }
    pub(crate) const fn format(&self) -> VideoFormat {
        self.format
    }
}
impl Drop for X11Recording {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

fn frame(
    reader: &mut Reader,
    sink: &mut dyn ScreenSampleSink,
    gate: &StartGate,
    sequence: u64,
    cursor: bool,
    show: bool,
    metrics: &ScreenCaptureMetrics,
) -> Result<(), CaptureError> {
    let clock = gate.session_time_ns()?;
    let anchor = Instant::now();
    let (frame, cursor, captured_at) = reader.read(show, cursor)?;
    let session_ns = clock.saturating_add(
        u64::try_from(captured_at.duration_since(anchor).as_nanos()).unwrap_or(u64::MAX),
    );
    let has_cursor = !matches!(cursor, crate::screen::CursorSampleState::Unknown);
    sink.push(OwnedScreenSample {
        frame,
        timestamp: FrameTimestamp {
            session_ns,
            native_pts_ns: None,
            source: TimestampSource::MonotonicArrival,
        },
        sequence,
        cursor,
    })?;
    metrics.received_frame(None, has_cursor);
    Ok(())
}
fn run(
    mut reader: Reader,
    sink: &mut dyn ScreenSampleSink,
    commands: mpsc::Receiver<Command>,
    period: Duration,
    cursor: bool,
    show: bool,
    metrics: &ScreenCaptureMetrics,
) -> Result<(), CaptureError> {
    let mut active: Option<Arc<StartGate>> = None;
    let mut next = Instant::now();
    let mut sequence = 0;
    loop {
        let command = if active.is_some() {
            commands.recv_timeout(next.saturating_duration_since(Instant::now()))
        } else {
            commands
                .recv()
                .map_err(|_| mpsc::RecvTimeoutError::Disconnected)
        };
        match command {
            Ok(Command::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => return Ok(()),
            Ok(Command::Pause(reply)) => {
                active = None;
                let result = sink.end_segment();
                let failed = result.is_err();
                let _ = reply.send(result);
                if failed {
                    return Err(error("Failed to finalize the paused segment"));
                }
            }
            Ok(Command::Segment(segment, reply)) => {
                if active.is_some() {
                    let _ = reply.send(Err(error("Cannot replace an active segment")));
                    continue;
                }
                let result = sink.begin_segment(segment);
                let failed = result.is_err();
                let _ = reply.send(result);
                if failed {
                    return Err(error("Failed to prepare the resumed segment"));
                }
            }
            Ok(Command::Start(gate, reply)) => {
                if active.is_some() {
                    let _ = reply.send(Err(error("Capture is already running")));
                    continue;
                }
                let result = frame(&mut reader, sink, &gate, sequence, cursor, show, metrics);
                sequence += 1;
                let failed = result.is_err();
                let _ = reply.send(result);
                if failed {
                    return Err(error("Failed to capture the first X11 frame"));
                }
                active = Some(gate);
                next = Instant::now() + period;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if let Some(gate) = &active {
                    frame(&mut reader, sink, gate, sequence, cursor, show, metrics)?;
                    sequence += 1;
                    next += period;
                    let late = Instant::now().saturating_duration_since(next);
                    if !late.is_zero() {
                        let skipped = u64::try_from(late.as_nanos() / period.as_nanos())
                            .unwrap_or(u64::MAX)
                            .saturating_add(1);
                        metrics.dropped_frames(skipped);
                        next = Instant::now() + period;
                    }
                }
            }
        }
    }
}
