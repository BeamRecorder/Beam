use std::{
    cell::{Cell, RefCell},
    rc::Rc,
    sync::{Arc, Mutex, mpsc},
    thread::{self, JoinHandle},
    time::Duration,
};

use crossbeam_channel::{Sender, TrySendError};
use pipewire::{self as pw, properties::properties, spa};
use spa::{param::ParamType, pod::Pod};

use crate::{CaptureError, model::SystemAudioSelection, session::StartGate};

use super::{SystemAudioFormat, SystemAudioMetrics, SystemAudioOpenRequest, SystemAudioSegment};
use crate::system_audio::wav::FloatWavWriter;

mod format;
mod support;
mod writer;
use format::{audio_format_parameter, parse_audio_format, peak_f32le};
use support::{join, pipewire_error, send_ready, set_fatal, take_fatal};
use writer::writer_worker;

const READY_TIMEOUT: Duration = Duration::from_secs(10);

enum Command {
    Start {
        gate: Arc<StartGate>,
        reply: mpsc::SyncSender<Result<(), CaptureError>>,
    },
    Pause {
        reply: mpsc::SyncSender<Result<(), CaptureError>>,
    },
    Stop,
}

pub(super) enum SinkMessage {
    Samples(Vec<u8>),
    Begin(
        SystemAudioSegment,
        mpsc::SyncSender<Result<(), CaptureError>>,
    ),
    End(mpsc::SyncSender<Result<(), CaptureError>>),
    Finish,
}

struct ProcessState {
    format: Option<SystemAudioFormat>,
    active: bool,
    stopping: bool,
    gate: Arc<StartGate>,
    sink: Sender<SinkMessage>,
    persist_samples: bool,
    metrics: Arc<SystemAudioMetrics>,
    fatal: Arc<Mutex<Option<CaptureError>>>,
}

pub(super) struct PipewireSystemAudioRecording {
    commands: Option<pw::channel::Sender<Command>>,
    sink: Sender<SinkMessage>,
    worker: Option<JoinHandle<Result<(), CaptureError>>>,
    writer: Option<JoinHandle<Result<(), CaptureError>>>,
    fatal: Arc<Mutex<Option<CaptureError>>>,
    format: SystemAudioFormat,
    metrics: Arc<SystemAudioMetrics>,
    start_gate: Arc<StartGate>,
    running: bool,
}

impl PipewireSystemAudioRecording {
    pub(super) fn open(request: SystemAudioOpenRequest) -> Result<Self, CaptureError> {
        Self::open_inner(
            request.selection,
            Some(request.segment),
            request.start_gate,
            request.queue_capacity,
        )
    }

    pub(super) fn open_preview(selection: SystemAudioSelection) -> Result<Self, CaptureError> {
        let gate = Arc::new(StartGate::new());
        gate.release(0)?;
        let mut preview = Self::open_inner(selection, None, gate, 1)?;
        preview.start()?;
        Ok(preview)
    }

    fn open_inner(
        selection: SystemAudioSelection,
        segment: Option<SystemAudioSegment>,
        start_gate: Arc<StartGate>,
        queue_capacity: usize,
    ) -> Result<Self, CaptureError> {
        match selection {
            SystemAudioSelection::DefaultOutput => {}
        }
        if queue_capacity == 0 {
            return Err(CaptureError::InvalidConfiguration(
                "system audio queue capacity must be non-zero".into(),
            ));
        }
        let persist_samples = segment.is_some();
        let (sink, receiver) = crossbeam_channel::bounded(queue_capacity);
        let (commands, command_receiver) = pw::channel::channel();
        let (ready, ready_receiver) = mpsc::sync_channel(1);
        let fatal = Arc::new(Mutex::new(None));
        let metrics = Arc::new(SystemAudioMetrics::default());
        let worker_sink = sink.clone();
        let worker_fatal = fatal.clone();
        let worker_metrics = metrics.clone();
        let worker_gate = start_gate.clone();
        let worker = thread::Builder::new()
            .name("beam-linux-system-audio".into())
            .spawn(move || {
                let result = pipewire_worker(
                    command_receiver,
                    worker_sink.clone(),
                    worker_fatal,
                    worker_metrics,
                    worker_gate,
                    persist_samples,
                    ready,
                );
                let _ = worker_sink.send(SinkMessage::Finish);
                result
            })
            .map_err(pipewire_error)?;
        let negotiated = ready_receiver
            .recv_timeout(READY_TIMEOUT)
            .map_err(|_| pipewire_error("system audio format negotiation timed out"))
            .and_then(|result| result);
        let format = match negotiated {
            Ok(format) => format,
            Err(error) => {
                let _ = commands.send(Command::Stop);
                let worker_error = worker.join().ok().and_then(Result::err);
                return worker_error.map_or_else(|| take_fatal(&fatal).and(Err(error)), Err);
            }
        };
        let initial_writer = match segment {
            Some(segment) => match FloatWavWriter::create(&segment.path, format) {
                Ok(writer) => Some(writer),
                Err(error) => {
                    let _ = commands.send(Command::Stop);
                    let _ = worker.join();
                    return Err(error);
                }
            },
            None => None,
        };
        let writer_fatal = fatal.clone();
        let writer = thread::Builder::new()
            .name("beam-system-audio-writer".into())
            .spawn(move || writer_worker(receiver, format, initial_writer, writer_fatal))
            .map_err(|error| CaptureError::Backend(error.to_string()));
        let writer = match writer {
            Ok(writer) => writer,
            Err(error) => {
                let _ = commands.send(Command::Stop);
                let _ = worker.join();
                return Err(error);
            }
        };
        Ok(Self {
            commands: Some(commands),
            sink,
            worker: Some(worker),
            writer: Some(writer),
            fatal,
            format,
            metrics,
            start_gate,
            running: false,
        })
    }

    pub(super) fn start(&mut self) -> Result<(), CaptureError> {
        self.send_wait(|reply| Command::Start {
            gate: self.start_gate.clone(),
            reply,
        })?;
        self.running = true;
        Ok(())
    }

    pub(super) fn pause(&mut self) -> Result<(), CaptureError> {
        if self.running {
            self.send_wait(|reply| Command::Pause { reply })?;
            self.send_sink_wait(SinkMessage::End)?;
            self.running = false;
        }
        Ok(())
    }

    pub(super) fn resume(
        &mut self,
        segment: SystemAudioSegment,
        start_gate: Arc<StartGate>,
    ) -> Result<(), CaptureError> {
        self.send_sink_wait(|reply| SinkMessage::Begin(segment, reply))?;
        self.start_gate = start_gate.clone();
        self.send_wait(|reply| Command::Start {
            gate: start_gate,
            reply,
        })?;
        self.running = true;
        Ok(())
    }

    pub(super) const fn format(&self) -> SystemAudioFormat {
        self.format
    }

    pub(super) fn metrics(&self) -> Arc<SystemAudioMetrics> {
        self.metrics.clone()
    }

    pub(super) fn stop(&mut self) -> Result<(), CaptureError> {
        if let Some(commands) = self.commands.take() {
            let _ = commands.send(Command::Stop);
        }
        let worker = join(&mut self.worker, "system audio PipeWire");
        let writer = join(&mut self.writer, "system audio writer");
        self.running = false;
        worker??;
        writer??;
        take_fatal(&self.fatal)
    }

    fn send_wait(
        &self,
        command: impl FnOnce(mpsc::SyncSender<Result<(), CaptureError>>) -> Command,
    ) -> Result<(), CaptureError> {
        let (reply, receiver) = mpsc::sync_channel(1);
        self.commands
            .as_ref()
            .ok_or_else(|| pipewire_error("system audio capture is already stopped"))?
            .send(command(reply))
            .map_err(|_| pipewire_error("system audio command channel is closed"))?;
        receiver
            .recv_timeout(READY_TIMEOUT)
            .map_err(|_| pipewire_error("system audio lifecycle command timed out"))?
    }

    fn send_sink_wait(
        &self,
        message: impl FnOnce(mpsc::SyncSender<Result<(), CaptureError>>) -> SinkMessage,
    ) -> Result<(), CaptureError> {
        let (reply, receiver) = mpsc::sync_channel(1);
        self.sink
            .send_timeout(message(reply), READY_TIMEOUT)
            .map_err(|_| CaptureError::Backend("system audio writer channel is closed".into()))?;
        receiver
            .recv_timeout(READY_TIMEOUT)
            .map_err(|_| CaptureError::Backend("system audio writer command timed out".into()))?
    }
}

impl Drop for PipewireSystemAudioRecording {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

fn pipewire_worker(
    commands: pw::channel::Receiver<Command>,
    sink: Sender<SinkMessage>,
    fatal: Arc<Mutex<Option<CaptureError>>>,
    metrics: Arc<SystemAudioMetrics>,
    start_gate: Arc<StartGate>,
    persist_samples: bool,
    ready: mpsc::SyncSender<Result<SystemAudioFormat, CaptureError>>,
) -> Result<(), CaptureError> {
    pw::init();
    let mainloop = pw::main_loop::MainLoopRc::new(None).map_err(pipewire_error)?;
    let context = pw::context::ContextRc::new(&mainloop, None).map_err(pipewire_error)?;
    let core = context.connect_rc(None).map_err(pipewire_error)?;
    let stream = pw::stream::StreamRc::new(
        core,
        "beam-system-audio",
        properties! {
            *pw::keys::MEDIA_TYPE => "Audio",
            *pw::keys::MEDIA_CATEGORY => "Capture",
            *pw::keys::MEDIA_ROLE => "Music",
            *pw::keys::STREAM_CAPTURE_SINK => "true",
        },
    )
    .map_err(pipewire_error)?;
    let state = Rc::new(RefCell::new(ProcessState {
        format: None,
        active: false,
        stopping: false,
        gate: start_gate,
        sink,
        persist_samples,
        metrics,
        fatal,
    }));
    let ready = Rc::new(RefCell::new(Some(ready)));
    let negotiation_stopped = Rc::new(Cell::new(false));
    let listener = audio_listener(&stream, &mainloop, &state, &ready, &negotiation_stopped)?;
    let command_stream = stream.downgrade();
    let command_state = state.clone();
    let command_loop = mainloop.clone();
    let attached = commands.attach(mainloop.loop_(), move |command| {
        let Some(stream) = command_stream.upgrade() else {
            command_loop.quit();
            return;
        };
        match command {
            Command::Start { gate, reply } => {
                let mut state = command_state.borrow_mut();
                state.gate = gate;
                state.active = true;
                let result = stream.set_active(true).map_err(pipewire_error);
                let _ = reply.send(result);
            }
            Command::Pause { reply } => {
                command_state.borrow_mut().active = false;
                let result = stream
                    .set_active(false)
                    .and_then(|()| stream.flush(false))
                    .map_err(pipewire_error);
                let _ = reply.send(result);
            }
            Command::Stop => {
                let mut state = command_state.borrow_mut();
                state.active = false;
                state.stopping = true;
                drop(state);
                let _ = stream.set_active(false);
                let _ = stream.disconnect();
                command_loop.quit();
            }
        }
    });
    let format_bytes = audio_format_parameter()?;
    let format_pod = Pod::from_bytes(&format_bytes)
        .ok_or_else(|| pipewire_error("failed to build system audio format parameter"))?;
    let mut params = [format_pod];
    stream
        .connect(
            spa::utils::Direction::Input,
            None,
            pw::stream::StreamFlags::AUTOCONNECT | pw::stream::StreamFlags::MAP_BUFFERS,
            &mut params,
        )
        .map_err(pipewire_error)?;
    mainloop.run();
    drop(attached);
    drop(listener);
    Ok(())
}

fn audio_listener(
    stream: &pw::stream::StreamRc,
    mainloop: &pw::main_loop::MainLoopRc,
    state: &Rc<RefCell<ProcessState>>,
    ready: &Rc<RefCell<Option<mpsc::SyncSender<Result<SystemAudioFormat, CaptureError>>>>>,
    negotiation_stopped: &Rc<Cell<bool>>,
) -> Result<pw::stream::StreamListener<()>, CaptureError> {
    let state_changed_state = state.clone();
    let state_changed_ready = ready.clone();
    let state_changed_loop = mainloop.clone();
    let state_changed_stopped = negotiation_stopped.clone();
    let format_state = state.clone();
    let format_ready = ready.clone();
    let format_loop = mainloop.clone();
    let format_stopped = negotiation_stopped.clone();
    let process_state = state.clone();
    stream
        .add_local_listener_with_user_data(())
        .state_changed(move |stream, _, _, new| match new {
            pw::stream::StreamState::Error(message) => {
                send_ready(&state_changed_ready, Err(pipewire_error(message.clone())));
                set_fatal(&state_changed_state.borrow().fatal, pipewire_error(message));
                state_changed_loop.quit();
            }
            pw::stream::StreamState::Paused if state_changed_stopped.get() => {
                if let Some(format) = state_changed_state.borrow().format {
                    send_ready(&state_changed_ready, Ok(format));
                }
            }
            pw::stream::StreamState::Streaming => {
                if state_changed_state.borrow().format.is_some()
                    && !state_changed_stopped.replace(true)
                    && let Err(error) = stream.set_active(false)
                {
                    send_ready(&state_changed_ready, Err(pipewire_error(error)));
                    state_changed_loop.quit();
                }
            }
            _ => {}
        })
        .param_changed(move |stream, _, id, param| {
            if id != ParamType::Format.as_raw() {
                return;
            }
            if param.is_none() && format_state.borrow().stopping {
                return;
            }
            let result = param
                .ok_or_else(|| pipewire_error("PipeWire removed the system audio format"))
                .and_then(parse_audio_format);
            match result {
                Ok(format) => {
                    format_state.borrow_mut().format = Some(format);
                    if matches!(stream.state(), pw::stream::StreamState::Paused)
                        && format_stopped.get()
                    {
                        send_ready(&format_ready, Ok(format));
                    } else if matches!(stream.state(), pw::stream::StreamState::Streaming)
                        && !format_stopped.replace(true)
                        && let Err(error) = stream.set_active(false)
                    {
                        send_ready(&format_ready, Err(pipewire_error(error)));
                        format_loop.quit();
                    }
                }
                Err(error) => {
                    send_ready(&format_ready, Err(pipewire_error(error.to_string())));
                    set_fatal(&format_state.borrow().fatal, error);
                    format_loop.quit();
                }
            }
        })
        .process(move |stream, _| process_audio(stream, &process_state))
        .register()
        .map_err(pipewire_error)
}

fn process_audio(stream: &pw::stream::Stream, state: &Rc<RefCell<ProcessState>>) {
    let state = state.borrow_mut();
    let Some(mut buffer) = stream.dequeue_buffer() else {
        return;
    };
    if !state.active || !state.gate.is_released() {
        return;
    }
    let Some(format) = state.format else {
        return;
    };
    let datas = buffer.datas_mut();
    let Some(data) = datas.first_mut() else {
        return;
    };
    let chunk = data.chunk();
    let offset = usize::try_from(chunk.offset()).unwrap_or(usize::MAX);
    let size = usize::try_from(chunk.size()).unwrap_or(0);
    let frame_bytes = 4 * usize::from(format.channels.max(1));
    let samples = u64::try_from(size / frame_bytes).unwrap_or(0);
    if size % frame_bytes != 0 {
        state.metrics.dropped(samples.saturating_add(1));
        return;
    }
    let Some(memory) = data.data() else {
        state.metrics.dropped(samples);
        return;
    };
    let Some(end) = offset.checked_add(size) else {
        state.metrics.dropped(samples);
        return;
    };
    let Some(bytes) = memory.get(offset..end) else {
        state.metrics.dropped(samples);
        return;
    };
    state.metrics.peak(peak_f32le(bytes));
    if !state.persist_samples {
        state.metrics.received(samples);
        return;
    }
    match state.sink.try_send(SinkMessage::Samples(bytes.to_vec())) {
        Ok(()) => state.metrics.received(samples),
        Err(TrySendError::Full(_)) => state.metrics.dropped(samples),
        Err(TrySendError::Disconnected(_)) => {
            set_fatal(
                &state.fatal,
                CaptureError::Backend("system audio writer stopped".into()),
            );
        }
    }
}

#[cfg(test)]
#[path = "linux/tests.rs"]
mod tests;
