use std::{
    cell::{Cell, RefCell},
    os::fd::OwnedFd,
    rc::Rc,
    sync::{Arc, Mutex, mpsc},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use crossbeam_channel::Sender;
use pipewire::{self as pw, properties::properties, spa};
use spa::{param::ParamType, pod::Pod};

use crate::{
    CaptureError, NativeCaptureErrorCode,
    screen::{ScreenCaptureMetrics, ScreenSampleSink, ScreenSegment, VideoFormat},
    session::StartGate,
};

use super::{
    CursorMessage, CursorState, ProcessState, SinkMessage, TimestampMapper, backpressure_event,
    flush_pending_cursor, format_error, format_parameter, has_fatal, join, parse_format,
    pipewire_error, process_buffer, send_ready_error, send_ready_ok, set_fatal, sink_error,
    sink_worker, stream_error, take_fatal, update_buffer_params,
};

const PIPEWIRE_READY_TIMEOUT: Duration = Duration::from_secs(10);
const CURSOR_QUEUE_CAPACITY: usize = 256;

enum PipewireCommand {
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
        self.send_wait(|reply| PipewireCommand::Start {
            start_ns: self.start_ns,
            start_gate: self.start_gate.clone(),
            reply,
        })?;
        self.running = true;
        Ok(())
    }

    pub(crate) fn pause(&mut self) -> Result<(), CaptureError> {
        if self.running {
            self.send_wait(|reply| PipewireCommand::Pause { reply })?;
            self.send_sink_wait(SinkMessage::EndSegment)?;
            self.running = false;
        }
        Ok(())
    }

    pub(crate) fn resume(
        &mut self,
        start_ns: u64,
        start_gate: Arc<StartGate>,
        segment: Option<ScreenSegment>,
    ) -> Result<(), CaptureError> {
        self.start_ns = start_ns;
        self.start_gate = start_gate.clone();
        if let Some(segment) = segment {
            self.send_sink_wait(|reply| SinkMessage::BeginSegment(segment, reply))?;
        }
        self.send_wait(|reply| PipewireCommand::Start {
            start_ns,
            start_gate,
            reply,
        })?;
        self.running = true;
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
        command: impl FnOnce(mpsc::SyncSender<Result<(), CaptureError>>) -> PipewireCommand,
    ) -> Result<(), CaptureError> {
        let (reply, receiver) = mpsc::sync_channel(1);
        self.send(command(reply))?;
        receiver
            .recv_timeout(PIPEWIRE_READY_TIMEOUT)
            .map_err(|_| pipewire_error("PipeWire lifecycle command timed out"))?
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
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

#[allow(clippy::too_many_arguments)]
fn pipewire_worker(
    remote_fd: OwnedFd,
    node_id: u32,
    stream_scope: String,
    commands: pw::channel::Receiver<PipewireCommand>,
    sink: Sender<SinkMessage>,
    cursor_sink: Sender<CursorMessage>,
    fatal: Arc<Mutex<Option<CaptureError>>>,
    metrics: Arc<ScreenCaptureMetrics>,
    start_ns: u64,
    start_gate: Arc<StartGate>,
    ready: mpsc::SyncSender<Result<VideoFormat, CaptureError>>,
    repair_window_crop: bool,
) -> Result<(), CaptureError> {
    pw::init();
    let mainloop = pw::main_loop::MainLoopRc::new(None).map_err(pipewire_error)?;
    let context = pw::context::ContextRc::new(&mainloop, None).map_err(pipewire_error)?;
    let core = context
        .connect_fd_rc(remote_fd, None)
        .map_err(pipewire_error)?;
    let stream = pw::stream::StreamRc::new(
        core,
        "beam-screen-capture",
        properties! {
            *pw::keys::MEDIA_TYPE => "Video",
            *pw::keys::MEDIA_CATEGORY => "Capture",
            *pw::keys::MEDIA_ROLE => "Screen",
        },
    )
    .map_err(pipewire_error)?;
    let state = Rc::new(RefCell::new(ProcessState {
        negotiated: None,
        last_announced: None,
        cursor: CursorState::new(stream_scope),
        timestamp: TimestampMapper::new(start_ns),
        start_gate,
        active: false,
        stopping: false,
        clock: Instant::now(),
        sink,
        cursor_sink,
        pending_cursor: None,
        metrics,
        fatal,
        pending_drops: 0,
        last_frame_geometry: None,
        repair_window_crop,
    }));
    let ready = Rc::new(RefCell::new(Some(ready)));
    let negotiation_stopped = Rc::new(Cell::new(false));
    let listener_state = state.clone();
    let listener_ready = ready.clone();
    let listener_loop = mainloop.clone();
    let listener_negotiation_stopped = negotiation_stopped.clone();
    let format_loop = mainloop.clone();
    let format_negotiation_stopped = negotiation_stopped.clone();
    let listener = stream
        .add_local_listener_with_user_data(())
        .state_changed(move |stream, _, _, new| match new {
            pw::stream::StreamState::Error(message) => {
                set_fatal(&listener_state.borrow().fatal, stream_error(&message));
                send_ready_error(&listener_ready, pipewire_error(message));
                listener_loop.quit();
            }
            pw::stream::StreamState::Paused => {
                if listener_negotiation_stopped.get()
                    && let Some(format) = listener_state.borrow().negotiated
                {
                    send_ready_ok(&listener_ready, format);
                }
            }
            pw::stream::StreamState::Streaming => {
                if listener_state.borrow().negotiated.is_some()
                    && !listener_negotiation_stopped.replace(true)
                    && let Err(error) = stream.set_active(false)
                {
                    let diagnostic = error.to_string();
                    set_fatal(&listener_state.borrow().fatal, pipewire_error(error));
                    send_ready_error(&listener_ready, pipewire_error(diagnostic));
                    listener_loop.quit();
                }
            }
            _ => {}
        })
        .param_changed({
            let state = state.clone();
            let ready = ready.clone();
            move |stream, _, id, param| {
                if id != ParamType::Format.as_raw() {
                    return;
                }
                if param.is_none() && state.borrow().stopping {
                    return;
                }
                let result = param
                    .ok_or_else(|| format_error("PipeWire removed the negotiated format"))
                    .and_then(parse_format);
                match result {
                    Ok(format) => {
                        state.borrow_mut().negotiated = Some(format);
                        if let Err(error) = update_buffer_params(stream, format) {
                            let diagnostic = error.to_string();
                            set_fatal(&state.borrow().fatal, error);
                            send_ready_error(&ready, format_error(diagnostic));
                            format_loop.quit();
                            return;
                        }
                        if matches!(stream.state(), pw::stream::StreamState::Paused) {
                            if format_negotiation_stopped.get() {
                                send_ready_ok(&ready, format);
                            }
                        } else if matches!(stream.state(), pw::stream::StreamState::Streaming)
                            && !format_negotiation_stopped.replace(true)
                            && let Err(error) = stream.set_active(false)
                        {
                            let diagnostic = error.to_string();
                            set_fatal(&state.borrow().fatal, pipewire_error(error));
                            send_ready_error(&ready, pipewire_error(diagnostic));
                            format_loop.quit();
                        }
                    }
                    Err(error) => {
                        let diagnostic = error.to_string();
                        set_fatal(&state.borrow().fatal, error);
                        send_ready_error(&ready, format_error(diagnostic));
                        format_loop.quit();
                    }
                }
            }
        })
        .process({
            let state = state.clone();
            move |stream, _| process_buffer(stream, &state)
        })
        .register()
        .map_err(pipewire_error)?;
    let command_stream = stream.downgrade();
    let command_state = state.clone();
    let command_loop = mainloop.clone();
    let attached = commands.attach(mainloop.loop_(), move |command| {
        let Some(stream) = command_stream.upgrade() else {
            command_loop.quit();
            return;
        };
        match command {
            PipewireCommand::Start {
                start_ns,
                start_gate,
                reply,
            } => {
                let mut state = command_state.borrow_mut();
                state.timestamp = TimestampMapper::new(start_ns);
                state.start_gate = start_gate;
                state.active = true;
                let result = stream.set_active(true).map_err(pipewire_error);
                if let Err(error) = &result {
                    set_fatal(&state.fatal, pipewire_error(error));
                }
                let _ = reply.send(result);
            }
            PipewireCommand::Pause { reply } => {
                let mut state = command_state.borrow_mut();
                state.active = false;
                flush_pending_cursor(&mut state);
                let result = stream
                    .set_active(false)
                    .and_then(|()| stream.flush(false))
                    .map_err(pipewire_error);
                if let Err(error) = &result {
                    set_fatal(&state.fatal, pipewire_error(error));
                }
                let _ = reply.send(result);
            }
            PipewireCommand::Stop => {
                let mut state = command_state.borrow_mut();
                state.active = false;
                state.stopping = true;
                flush_pending_cursor(&mut state);
                drop(state);
                let _ = stream.set_active(false);
                let _ = stream.disconnect();
                command_loop.quit();
            }
        }
    });
    let format_bytes = format_parameter()?;
    let format_pod = Pod::from_bytes(&format_bytes)
        .ok_or_else(|| format_error("failed to build PipeWire format parameter"))?;
    let mut params = [format_pod];
    stream
        .connect(
            spa::utils::Direction::Input,
            Some(node_id),
            pw::stream::StreamFlags::AUTOCONNECT | pw::stream::StreamFlags::MAP_BUFFERS,
            &mut params,
        )
        .map_err(pipewire_error)?;
    mainloop.run();
    drop(attached);
    drop(listener);
    let state = state.borrow_mut();
    if state.pending_drops > 0 {
        let _ = state
            .sink
            .send(SinkMessage::Discontinuity(backpressure_event(
                state.pending_drops,
                start_ns,
            )));
    }
    Ok(())
}
