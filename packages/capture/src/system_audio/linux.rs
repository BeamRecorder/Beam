use std::{
    cell::{Cell, RefCell},
    rc::Rc,
    sync::{Arc, Mutex, mpsc},
    thread::JoinHandle,
    time::Duration,
};

use crossbeam_channel::{Sender, TrySendError};
use pipewire::{self as pw, properties::properties, spa};
use spa::{param::ParamType, pod::Pod};

use crate::{CaptureError, model::SystemAudioSelection, session::StartGate};

use super::{SystemAudioFormat, SystemAudioMetrics, SystemAudioOpenRequest, SystemAudioSegment};

mod format;
mod negotiation;
mod open;
mod support;
mod writer;
use format::{audio_format_parameter, parse_audio_format_event, peak_f32le};
use negotiation::{handle_format_changed, handle_state_changed};
use support::{ReadySender, join, pipewire_error, send_ready, set_fatal, take_fatal};

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
        let fatal_result = take_fatal(&self.fatal);
        worker??;
        writer??;
        fatal_result
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
    ready: &ReadySender,
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
        .state_changed(move |stream, _, _, new| {
            handle_state_changed(
                new,
                &state_changed_state,
                &state_changed_ready,
                &state_changed_stopped,
                || stream.set_active(false).map_err(pipewire_error),
                || state_changed_loop.quit(),
            );
        })
        .param_changed(move |stream, _, id, param| {
            if id != ParamType::Format.as_raw() {
                return;
            }
            handle_format_changed(
                parse_audio_format_event(param),
                stream.state(),
                &format_state,
                &format_ready,
                &format_stopped,
                || stream.set_active(false).map_err(pipewire_error),
                || format_loop.quit(),
            );
        })
        .process(move |stream, _| process_audio(stream, &process_state))
        .register()
        .map_err(pipewire_error)
}

fn process_audio(stream: &pw::stream::Stream, state: &Rc<RefCell<ProcessState>>) {
    let state = state.borrow();
    let Some(mut buffer) = stream.dequeue_buffer() else {
        return;
    };
    let datas = buffer.datas_mut();
    let Some(data) = datas.first_mut() else {
        return;
    };
    let chunk = data.chunk();
    let offset = usize::try_from(chunk.offset()).unwrap_or(usize::MAX);
    let size = usize::try_from(chunk.size()).unwrap_or(0);
    let memory = data.data();
    process_audio_chunk(&state, offset, size, memory.as_deref());
}

fn process_audio_chunk(state: &ProcessState, offset: usize, size: usize, memory: Option<&[u8]>) {
    if !state.active || !state.gate.is_released() {
        return;
    }
    let Some(format) = state.format else {
        return;
    };
    let frame_bytes = 4 * usize::from(format.channels.max(1));
    let samples = u64::try_from(size / frame_bytes).unwrap_or(0);
    if !size.is_multiple_of(frame_bytes) {
        state.metrics.dropped(samples.saturating_add(1));
        return;
    }
    let Some(memory) = memory else {
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

#[path = "../../test/system_audio/linux.rs"]
mod tests_checks;

#[path = "../../test/system_audio/linux/process_chunk.rs"]
mod chunk_checks;

#[path = "../../test/system_audio/linux/daemon.rs"]
mod daemon_checks;
