use std::{
    cell::RefCell,
    rc::Rc,
    sync::{Arc, atomic::AtomicUsize, mpsc},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use beam_media_core::{SessionClock, StartGate};
use crossbeam_channel::{Receiver, Sender};
use pipewire::{self as pw, properties::properties, spa};
use spa::{param::ParamType, pod::Pod};

use super::format::{NegotiatedFormat, format_parameter, header_meta_parameter, parse_format};
#[path = "handlers.rs"]
mod handlers;
use super::{
    catalog::selected_sink,
    process::{ProcessState, process_audio},
    sink_watch::SelectedSinkWatch,
};
use crate::{AudioError, AudioEvent, AudioQueueLimits, TimedAudioPacket, queue::AudioPacketQueue};
use handlers::{handle_command, handle_format_result, handle_stream_state};

const READY_TIMEOUT: Duration = Duration::from_secs(10);

enum Command {
    Start,
    Stop,
}

type ReadySender = Rc<RefCell<Option<mpsc::SyncSender<Result<NegotiatedFormat, AudioError>>>>>;

pub struct SystemAudioCapture {
    commands: Option<pw::channel::Sender<Command>>,
    worker: Option<JoinHandle<Result<(), AudioError>>>,
    packets: AudioPacketQueue,
    events: Receiver<AudioEvent>,
    terminal_events: Receiver<AudioEvent>,
    pub sample_rate: u32,
    pub channels: u16,
}

impl SystemAudioCapture {
    pub fn queue_depth(&self) -> (usize, usize) {
        self.packets.depth()
    }

    pub fn try_packet(&self) -> Result<Option<TimedAudioPacket>, AudioError> {
        self.packets.try_packet()
    }

    pub fn recv_packet_timeout(
        &self,
        timeout: Duration,
    ) -> Result<Option<TimedAudioPacket>, AudioError> {
        self.packets.recv_packet_timeout(timeout)
    }

    pub fn try_event(&self) -> Option<AudioEvent> {
        self.terminal_events
            .try_recv()
            .ok()
            .or_else(|| self.events.try_recv().ok())
    }

    pub fn stop(mut self) -> Result<(), AudioError> {
        self.halt()
    }

    pub fn halt(&mut self) -> Result<(), AudioError> {
        self.shutdown()
    }

    fn shutdown(&mut self) -> Result<(), AudioError> {
        if let Some(commands) = self.commands.take() {
            let _ = commands.send(Command::Stop);
        }
        wait_worker(&mut self.worker, Duration::from_secs(2))
    }
}

impl Drop for SystemAudioCapture {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

pub fn open_system_audio(
    device_id: Option<&str>,
    clock: SessionClock,
    gate: Arc<StartGate>,
    limits: AudioQueueLimits,
) -> Result<SystemAudioCapture, AudioError> {
    let target = selected_sink(device_id)?;
    open_system_audio_with_worker(target, clock, gate, limits, run_pipewire)
}

fn open_system_audio_with_worker(
    target: Option<String>,
    clock: SessionClock,
    gate: Arc<StartGate>,
    limits: AudioQueueLimits,
    worker: impl FnOnce(
        pw::channel::Receiver<Command>,
        Sender<TimedAudioPacket>,
        Sender<AudioEvent>,
        Sender<AudioEvent>,
        Arc<AtomicUsize>,
        Option<String>,
        SessionClock,
        Arc<StartGate>,
        usize,
        mpsc::SyncSender<Result<NegotiatedFormat, AudioError>>,
    ) -> Result<(), AudioError>
    + Send
    + 'static,
) -> Result<SystemAudioCapture, AudioError> {
    if limits.packets == 0 || limits.bytes == 0 {
        return Err(AudioError::Unsupported(
            "audio queue limits must be non-zero".into(),
        ));
    }
    let (commands, command_rx) = pw::channel::channel();
    let (packet_tx, packets) = crossbeam_channel::bounded(limits.packets);
    let (event_tx, events) = crossbeam_channel::bounded(64);
    let (terminal_tx, terminal_events) = crossbeam_channel::bounded(1);
    let queued_bytes = Arc::new(AtomicUsize::new(0));
    let worker_bytes = queued_bytes.clone();
    let (ready_tx, ready_rx) = mpsc::sync_channel(1);
    let ready_fallback = ready_tx.clone();
    let worker = thread::Builder::new()
        .name("beam-pipewire-system-audio".into())
        .spawn(move || {
            let result = worker(
                command_rx,
                packet_tx,
                event_tx,
                terminal_tx.clone(),
                worker_bytes,
                target,
                clock,
                gate,
                limits.bytes,
                ready_tx,
            );
            if let Err(error) = &result {
                let _ = ready_fallback.try_send(Err(AudioError::Backend(error.to_string())));
                let _ = terminal_tx.try_send(AudioEvent::Failed(error.to_string()));
            }
            result
        })
        .map_err(|error| AudioError::Backend(error.to_string()))?;
    let format = match ready_rx.recv_timeout(READY_TIMEOUT) {
        Ok(Ok(format)) => format,
        Ok(Err(error)) => {
            let _ = commands.send(Command::Stop);
            let _ = join_worker(worker);
            return Err(error);
        }
        Err(_) => {
            let _ = commands.send(Command::Stop);
            let _ = join_worker(worker);
            return Err(AudioError::Backend(
                "PipeWire audio format negotiation timed out".into(),
            ));
        }
    };
    if commands.send(Command::Start).is_err() {
        let _ = join_worker(worker);
        return Err(AudioError::Backend(
            "PipeWire command channel closed".into(),
        ));
    }
    Ok(SystemAudioCapture {
        commands: Some(commands),
        worker: Some(worker),
        packets: AudioPacketQueue::new(
            packets,
            queued_bytes,
            "PipeWire packet producer disconnected",
        ),
        events,
        terminal_events,
        sample_rate: format.sample_rate,
        channels: format.channels,
    })
}

fn join_worker(worker: JoinHandle<Result<(), AudioError>>) -> Result<(), AudioError> {
    wait_worker(&mut Some(worker), Duration::from_secs(2))
}

fn wait_worker(
    worker: &mut Option<JoinHandle<Result<(), AudioError>>>,
    timeout: Duration,
) -> Result<(), AudioError> {
    let Some(running) = worker.as_ref() else {
        return Ok(());
    };
    let deadline = Instant::now() + timeout;
    while !running.is_finished() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    if !running.is_finished() {
        return Err(AudioError::Backend(format!(
            "PipeWire audio worker did not stop within {} ms",
            timeout.as_millis()
        )));
    }
    let Some(finished) = worker.take() else {
        return Ok(());
    };
    finished
        .join()
        .map_err(|_| AudioError::Backend("PipeWire thread panicked".into()))?
}

#[allow(clippy::too_many_arguments)]
fn run_pipewire(
    commands: pw::channel::Receiver<Command>,
    packet_tx: Sender<TimedAudioPacket>,
    event_tx: Sender<AudioEvent>,
    terminal_tx: Sender<AudioEvent>,
    queued_bytes: Arc<AtomicUsize>,
    target: Option<String>,
    clock: SessionClock,
    gate: Arc<StartGate>,
    byte_limit: usize,
    ready_tx: mpsc::SyncSender<Result<NegotiatedFormat, AudioError>>,
) -> Result<(), AudioError> {
    pw::init();
    let mainloop = pw::main_loop::MainLoopRc::new(None)
        .map_err(|error| AudioError::Backend(error.to_string()))?;
    let context = pw::context::ContextRc::new(&mainloop, None)
        .map_err(|error| AudioError::Backend(error.to_string()))?;
    let core = context
        .connect_rc(None)
        .map_err(|error| AudioError::Backend(error.to_string()))?;
    let registry = if target.is_some() {
        Some(
            core.get_registry_rc()
                .map_err(|error| AudioError::Backend(error.to_string()))?,
        )
    } else {
        None
    };
    let props = handlers::capture_properties(target.as_deref());
    let stream = pw::stream::StreamRc::new(core, "beam-native-system-audio", props)
        .map_err(|error| AudioError::Backend(error.to_string()))?;
    let state = Rc::new(RefCell::new(ProcessState {
        format: None,
        clock,
        gate,
        sample_clock: None,
        gate_epoch: 0,
        next_sample: 0,
        active: false,
        packet_tx,
        event_tx,
        terminal_tx,
        queued_bytes,
        byte_limit,
        last_native_timestamp_ns: None,
        native_timestamps_invalidated: false,
    }));
    let sink_listener =
        if let (Some(registry), Some(target)) = (registry.as_ref(), target) {
            let watch = Rc::new(SelectedSinkWatch::new(target));
            let observed = watch.clone();
            let removed = watch.clone();
            let error_state = state.clone();
            let error_loop = mainloop.clone();
            Some(
                registry
                    .add_listener_local()
                    .global(move |global| {
                        if global.type_ == pw::types::ObjectType::Node
                            && let Some(props) = global.props
                        {
                            observed.observe(global.id, props);
                        }
                    })
                    .global_remove(move |id| {
                        if removed.removed(id) {
                            let _ = error_state.borrow().terminal_tx.try_send(
                                AudioEvent::DeviceChanged(format!(
                                    "selected PipeWire output {} disappeared",
                                    removed.name()
                                )),
                            );
                            error_loop.quit();
                        }
                    })
                    .register(),
            )
        } else {
            None
        };
    let ready = Rc::new(RefCell::new(Some(ready_tx)));
    let listener = attach_listener(&stream, &mainloop, &state, &ready)?;
    let command_stream = stream.downgrade();
    let command_loop = mainloop.clone();
    let command_state = state.clone();
    let attached = commands.attach(mainloop.loop_(), move |command| {
        let Some(stream) = command_stream.upgrade() else {
            command_loop.quit();
            return;
        };
        handle_command(
            command,
            &command_state,
            |active| {
                stream
                    .set_active(active)
                    .map_err(|error| AudioError::Backend(error.to_string()))
            },
            || {
                stream
                    .disconnect()
                    .map_err(|error| AudioError::Backend(error.to_string()))
            },
            || command_loop.quit(),
        );
    });
    let parameter = format_parameter()?;
    let pod = Pod::from_bytes(&parameter)
        .ok_or_else(|| AudioError::Backend("invalid PipeWire audio parameter".into()))?;
    let mut params = [pod];
    stream
        .connect(
            spa::utils::Direction::Input,
            None,
            pw::stream::StreamFlags::AUTOCONNECT | pw::stream::StreamFlags::MAP_BUFFERS,
            &mut params,
        )
        .map_err(|error| AudioError::Backend(error.to_string()))?;
    mainloop.run();
    drop(attached);
    drop(listener);
    drop(sink_listener);
    Ok(())
}

fn attach_listener(
    stream: &pw::stream::StreamRc,
    mainloop: &pw::main_loop::MainLoopRc,
    state: &Rc<RefCell<ProcessState>>,
    ready: &ReadySender,
) -> Result<pw::stream::StreamListener<()>, AudioError> {
    let error_state = state.clone();
    let error_ready = ready.clone();
    let error_loop = mainloop.clone();
    let format_state = state.clone();
    let format_ready = ready.clone();
    let format_loop = mainloop.clone();
    let process_state = state.clone();
    stream
        .add_local_listener_with_user_data(())
        .state_changed(move |_, _, _, new| {
            handle_stream_state(new, &error_state, &error_ready, || error_loop.quit());
        })
        .param_changed(move |stream, _, id, param| {
            if id != ParamType::Format.as_raw() {
                return;
            }
            let Some(param) = param else { return };
            handle_format_result(
                parse_format(param),
                &format_state,
                &format_ready,
                || {
                    let bytes = header_meta_parameter()?;
                    let mut params = [Pod::from_bytes(&bytes).ok_or_else(|| {
                        AudioError::Backend("invalid PipeWire header parameter".into())
                    })?];
                    stream
                        .update_params(&mut params)
                        .map_err(|error| AudioError::Backend(error.to_string()))
                },
                || format_loop.quit(),
            );
        })
        .process(move |stream, _| process_audio(stream, &process_state))
        .register()
        .map_err(|error| AudioError::Backend(error.to_string()))
}

fn report_listener_failure(
    state: &Rc<RefCell<ProcessState>>,
    ready: &ReadySender,
    message: String,
) {
    if let Some(sender) = ready.borrow_mut().take() {
        let _ = sender.try_send(Err(AudioError::Backend(message.clone())));
    }
    let _ = state
        .borrow()
        .terminal_tx
        .try_send(AudioEvent::Failed(message));
}

fn accept_negotiated_format(
    state: &Rc<RefCell<ProcessState>>,
    ready: &ReadySender,
    format: NegotiatedFormat,
) -> bool {
    {
        let mut state = state.borrow_mut();
        if state.format.is_some_and(|previous| previous != format) {
            let _ = state.terminal_tx.try_send(AudioEvent::DeviceChanged(
                "PipeWire system output format changed".into(),
            ));
            return false;
        }
        state.format = Some(format);
    }
    if let Some(sender) = ready.borrow_mut().take() {
        let _ = sender.try_send(Ok(format));
    }
    true
}

#[path = "../../test/linux/capture_unit.rs"]
mod capture_checks;

#[path = "../../test/linux/daemon.rs"]
mod daemon_checks;
