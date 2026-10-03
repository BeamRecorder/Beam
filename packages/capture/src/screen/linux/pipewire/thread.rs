use super::{
    SinkMessage, has_fatal, join, pipewire_error, pipewire_worker, sink_error, sink_worker,
    take_fatal,
};
use crate::{
    CaptureError, NativeCaptureErrorCode,
    model::ScreenRegion,
    screen::{ScreenCaptureMetrics, ScreenSampleSink, ScreenSegment, VideoFormat},
    session::StartGate,
};
use crossbeam_channel::Sender;
use pipewire as pw;
use std::{
    os::fd::OwnedFd,
    sync::{Arc, Mutex, mpsc},
    thread::{self, JoinHandle},
    time::Duration,
};

const PIPEWIRE_READY_TIMEOUT: Duration = Duration::from_secs(10);
const CURSOR_QUEUE_CAPACITY: usize = 256;

pub(super) enum PipewireCommand {
    Start {
        start_ns: u64,
        start_gate: Arc<StartGate>,
        reply: mpsc::SyncSender<Result<(), CaptureError>>,
    },
    Pause {
        reply: mpsc::SyncSender<Result<(), CaptureError>>,
    },
    Stop,
}

pub(crate) struct PipewireCapture {
    commands: Option<pw::channel::Sender<PipewireCommand>>,
    thread: Option<JoinHandle<Result<(), CaptureError>>>,
    sink_thread: Option<JoinHandle<Result<(), CaptureError>>>,
    fatal: Arc<Mutex<Option<CaptureError>>>,
    sink: Sender<SinkMessage>,
    format: VideoFormat,
    start_ns: u64,
    start_gate: Arc<StartGate>,
    running: bool,
}

pub(crate) struct PipewireCaptureRequest {
    pub(crate) remote_fd: OwnedFd,
    pub(crate) node_id: u32,
    pub(crate) stream_scope: String,
    pub(crate) queue_capacity: usize,
    pub(crate) sink: Box<dyn ScreenSampleSink>,
    pub(crate) start_ns: u64,
    pub(crate) start_gate: Arc<StartGate>,
    pub(crate) metrics: Arc<ScreenCaptureMetrics>,
    pub(crate) repair_window_crop: bool,
    pub(crate) region: Option<ScreenRegion>,
    pub(crate) separate_cursor_enabled: bool,
    pub(crate) show_real_cursor: bool,
    pub(crate) target_fps: u32,
}

impl PipewireCapture {
    pub(crate) fn prepare(request: PipewireCaptureRequest) -> Result<Self, CaptureError> {
        let PipewireCaptureRequest {
            remote_fd,
            node_id,
            stream_scope,
            queue_capacity,
            sink,
            start_ns,
            start_gate,
            metrics,
            repair_window_crop,
            region,
            separate_cursor_enabled,
            show_real_cursor,
            target_fps,
        } = request;
        if queue_capacity == 0 {
            return Err(CaptureError::InvalidConfiguration(
                "screen sample queue capacity must be non-zero".into(),
            ));
        }
        let (sink_sender, sink_receiver) = crossbeam_channel::bounded(queue_capacity);
        let (cursor_sender, cursor_receiver) = crossbeam_channel::bounded(CURSOR_QUEUE_CAPACITY);
        let fatal = Arc::new(Mutex::new(None));
        let sink_fatal = fatal.clone();
        let sink_thread = thread::Builder::new()
            .name("beam-linux-screen-sink".into())
            .spawn(move || sink_worker(sink, sink_receiver, cursor_receiver, sink_fatal))
            .map_err(|error| sink_error(error.to_string()))?;
        let (commands, receiver) = pw::channel::channel();
        let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
        let worker_fatal = fatal.clone();
        let worker_metrics = metrics.clone();
        let worker_gate = start_gate.clone();
        let finish_sender = sink_sender.clone();
        let lifecycle_sender = sink_sender.clone();
        let cleanup_sender = sink_sender.clone();
        let thread = thread::Builder::new()
            .name("beam-linux-pipewire".into())
            .spawn(move || {
                let result = pipewire_worker(
                    remote_fd,
                    node_id,
                    stream_scope,
                    receiver,
                    sink_sender,
                    cursor_sender,
                    worker_fatal,
                    worker_metrics,
                    start_ns,
                    worker_gate,
                    ready_sender,
                    repair_window_crop,
                    region,
                    show_real_cursor,
                    target_fps,
                    separate_cursor_enabled,
                );
                let _ = finish_sender.send(SinkMessage::Finish);
                result
            });
        let thread = match thread {
            Ok(thread) => thread,
            Err(error) => {
                drop(commands);
                let _ = cleanup_sender.send(SinkMessage::Finish);
                let _ = sink_thread.join();
                return Err(pipewire_error(error));
            }
        };
        drop(cleanup_sender);
        let format = match ready_receiver
            .recv_timeout(PIPEWIRE_READY_TIMEOUT)
            .map_err(|_| {
                CaptureError::native(
                    NativeCaptureErrorCode::PipewireConnectFailed,
                    "PipeWire stream negotiation timed out",
                )
            })
            .and_then(|result| result)
        {
            Ok(format) => format,
            Err(error) => {
                let _ = commands.send(PipewireCommand::Stop);
                let _ = thread.join();
                let _ = sink_thread.join();
                return match take_fatal(&fatal) {
                    Err(fatal) => Err(fatal),
                    Ok(()) => Err(error),
                };
            }
        };
        Ok(Self {
            commands: Some(commands),
            thread: Some(thread),
            sink_thread: Some(sink_thread),
            fatal,
            sink: lifecycle_sender,
            format,
            start_ns,
            start_gate,
            running: false,
        })
    }

    pub(crate) fn start(&mut self) -> Result<(), CaptureError> {
        if !self.start_gate.is_released() {
            return Err(CaptureError::InvalidTransition {
                from: "Armed".into(),
                to: "Recording".into(),
            });
        }
        self.send_wait("the first video frame", |reply| PipewireCommand::Start {
            start_ns: self.start_ns,
            start_gate: self.start_gate.clone(),
            reply,
        })?;
        self.running = true;
        Ok(())
    }

    pub(crate) fn pause(&mut self) -> Result<(), CaptureError> {
        if self.running {
            self.send_wait("pause", |reply| PipewireCommand::Pause { reply })?;
            self.send_sink_wait(SinkMessage::EndSegment)?;
            self.running = false;
        }
        Ok(())
    }

    pub(crate) fn prepare_resume(
        &mut self,
        start_ns: u64,
        start_gate: Arc<StartGate>,
        segment: Option<ScreenSegment>,
    ) -> Result<(), CaptureError> {
        self.start_ns = start_ns;
        self.start_gate = start_gate;
        if let Some(segment) = segment {
            self.send_sink_wait(|reply| SinkMessage::BeginSegment(segment, reply))?;
        }
        Ok(())
    }

    #[must_use]
    pub(crate) const fn video_format(&self) -> VideoFormat {
        self.format
    }

    pub(crate) fn stop(&mut self) -> Result<(), CaptureError> {
        if let Some(commands) = self.commands.take() {
            let _ = commands.send(PipewireCommand::Stop);
        }
        let worker_result = join(&mut self.thread, "PipeWire")?;
        let sink_result = join(&mut self.sink_thread, "screen sink")?;
        self.running = false;
        worker_result?;
        sink_result?;
        take_fatal(&self.fatal)
    }

    pub(crate) fn is_available(&self) -> bool {
        !has_fatal(&self.fatal)
            && self
                .thread
                .as_ref()
                .is_none_or(|thread| !thread.is_finished())
    }

    fn send(&self, command: PipewireCommand) -> Result<(), CaptureError> {
        self.commands
            .as_ref()
            .ok_or_else(|| pipewire_error("PipeWire capture is already stopped"))?
            .send(command)
            .map_err(|_| pipewire_error("PipeWire command channel is closed"))
    }

    fn send_wait(
        &self,
        operation: &str,
        command: impl FnOnce(mpsc::SyncSender<Result<(), CaptureError>>) -> PipewireCommand,
    ) -> Result<(), CaptureError> {
        let (reply, receiver) = mpsc::sync_channel(1);
        self.send(command(reply))?;
        receiver
            .recv_timeout(PIPEWIRE_READY_TIMEOUT)
            .map_err(|error| {
                pipewire_error(format!(
                    "Waiting for {operation} from PipeWire failed: {error}"
                ))
            })?
    }

    fn send_sink_wait(
        &self,
        command: impl FnOnce(mpsc::SyncSender<Result<(), CaptureError>>) -> SinkMessage,
    ) -> Result<(), CaptureError> {
        let (reply, receiver) = mpsc::sync_channel(1);
        self.sink
            .send_timeout(command(reply), PIPEWIRE_READY_TIMEOUT)
            .map_err(|_| sink_error("screen sink lifecycle channel is closed"))?;
        receiver
            .recv_timeout(PIPEWIRE_READY_TIMEOUT)
            .map_err(|_| sink_error("screen sink lifecycle command timed out"))?
    }
}

impl Drop for PipewireCapture {
    fn drop(&mut self) { let _ = self.stop(); }
}

#[cfg(test)]
#[path = "thread_tests.rs"]
mod tests;