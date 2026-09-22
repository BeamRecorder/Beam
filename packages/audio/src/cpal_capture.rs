use std::{
    str::FromStr,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

#[cfg(target_os = "macos")]
use std::time::Instant;

use beam_media_core::{AudioPacket, MonotonicClock, SessionClock, StartGate};
use cpal::{
    SampleFormat, SupportedStreamConfig, SupportedStreamConfigRange,
    traits::{DeviceTrait, HostTrait, StreamTrait},
};
use crossbeam_channel::{Receiver, Sender, TrySendError};

use crate::{
    AudioDevice, AudioError, AudioEvent, AudioQueueLimits, TimedAudioPacket,
    queue::AudioPacketQueue, timing::AudioTimeline,
};

const MAX_AUDIO_LEAD_NS: u64 = 2_000_000_000;

pub struct AudioCapture {
    stream: cpal::Stream,
    #[cfg(target_os = "macos")]
    _tap: Option<crate::macos::ProcessTap>,
    packets: AudioPacketQueue,
    events: Receiver<AudioEvent>,
    terminal_events: Receiver<AudioEvent>,
    pub sample_rate: u32,
    pub channels: u16,
}

impl AudioCapture {
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

    pub fn halt(&mut self) -> Result<(), AudioError> {
        self.stream.pause().map_err(AudioError::from)
    }

    pub fn stop(mut self) -> Result<(), AudioError> {
        self.halt()
    }
}

pub fn list_inputs() -> Result<Vec<AudioDevice>, AudioError> {
    list_inputs_with_host(&cpal::default_host())
}

fn list_inputs_with_host(host: &cpal::Host) -> Result<Vec<AudioDevice>, AudioError> {
    let default_id = host
        .default_input_device()
        .and_then(|device| device.id().ok());
    host.input_devices()
        .map_err(AudioError::from)?
        .map(|device| describe_device(&device, default_id.as_ref()))
        .collect()
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
pub fn list_system_outputs() -> Result<Vec<AudioDevice>, AudioError> {
    list_system_outputs_with_host(&cpal::default_host())
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn list_system_outputs_with_host(host: &cpal::Host) -> Result<Vec<AudioDevice>, AudioError> {
    let default_id = host
        .default_output_device()
        .and_then(|device| device.id().ok());
    host.output_devices()
        .map_err(AudioError::from)?
        .map(|device| describe_device(&device, default_id.as_ref()))
        .collect()
}

fn describe_device(
    device: &cpal::Device,
    default_id: Option<&cpal::DeviceId>,
) -> Result<AudioDevice, AudioError> {
    let id = device.id().map_err(AudioError::from)?;
    let name = device
        .description()
        .map_err(AudioError::from)?
        .name()
        .to_owned();
    Ok(AudioDevice {
        id: id.to_string(),
        name,
        is_default: default_id == Some(&id),
    })
}

pub fn open_microphone(
    device_id: Option<&str>,
    clock: SessionClock,
    gate: Arc<StartGate>,
    limits: AudioQueueLimits,
) -> Result<AudioCapture, AudioError> {
    open_microphone_with_host(&cpal::default_host(), device_id, clock, gate, limits)
}

fn open_microphone_with_host(
    host: &cpal::Host,
    device_id: Option<&str>,
    clock: SessionClock,
    gate: Arc<StartGate>,
    limits: AudioQueueLimits,
) -> Result<AudioCapture, AudioError> {
    let device = select_device(host, device_id, false)?;
    let config = preferred_config(&device, false)?;
    open_input(device, config, clock, gate, limits)
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
pub fn open_system_audio(
    device_id: Option<&str>,
    clock: SessionClock,
    gate: Arc<StartGate>,
    limits: AudioQueueLimits,
) -> Result<AudioCapture, AudioError> {
    open_system_audio_with_host(&cpal::default_host(), device_id, clock, gate, limits)
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn open_system_audio_with_host(
    host: &cpal::Host,
    device_id: Option<&str>,
    clock: SessionClock,
    gate: Arc<StartGate>,
    limits: AudioQueueLimits,
) -> Result<AudioCapture, AudioError> {
    let device = select_device(host, device_id, true)?;
    #[cfg(target_os = "macos")]
    if device.supports_input() {
        let output_uid = device.id().map_err(AudioError::from)?;
        let tap = crate::macos::ProcessTap::new(output_uid.id())?;
        let deadline = Instant::now() + Duration::from_secs(1);
        let aggregate = loop {
            if let Some(device) = host.device_by_id(&tap.device_id()) {
                break device;
            }
            if Instant::now() >= deadline {
                return Err(AudioError::DeviceUnavailable(
                    "Core Audio tap aggregate".into(),
                ));
            }
            std::thread::sleep(Duration::from_millis(10));
        };
        let config = preferred_config(&aggregate, false)?;
        let mut capture = open_input(aggregate, config, clock, gate, limits)?;
        capture._tap = Some(tap);
        return Ok(capture);
    }
    let config = preferred_config(&device, true)?;
    open_input(device, config, clock, gate, limits)
}

fn select_device(
    host: &cpal::Host,
    device_id: Option<&str>,
    output: bool,
) -> Result<cpal::Device, AudioError> {
    let device = match device_id {
        Some(id) => {
            let id = cpal::DeviceId::from_str(id).map_err(AudioError::from)?;
            host.device_by_id(&id)
        }
        None if output => host.default_output_device(),
        None => host.default_input_device(),
    }
    .ok_or_else(|| AudioError::DeviceUnavailable(device_id.unwrap_or("default").into()))?;
    if (output && !device.supports_output()) || (!output && !device.supports_input()) {
        return Err(AudioError::Unsupported(
            "selected audio device does not support the requested direction".into(),
        ));
    }
    Ok(device)
}

fn preferred_config(
    device: &cpal::Device,
    output: bool,
) -> Result<SupportedStreamConfig, AudioError> {
    let default = if output {
        device.default_output_config()
    } else {
        device.default_input_config()
    }
    .map_err(AudioError::from)?;
    if matches!(
        default.sample_format(),
        SampleFormat::F32 | SampleFormat::I16
    ) {
        return Ok(default);
    }
    let ranges: Vec<_> = if output {
        device
            .supported_output_configs()
            .map_err(AudioError::from)?
            .collect()
    } else {
        device
            .supported_input_configs()
            .map_err(AudioError::from)?
            .collect()
    };
    choose_fallback_config(default, &ranges)
}

fn choose_fallback_config(
    default: SupportedStreamConfig,
    ranges: &[SupportedStreamConfigRange],
) -> Result<SupportedStreamConfig, AudioError> {
    for format in [SampleFormat::F32, SampleFormat::I16] {
        if let Some(range) = ranges.iter().find(|range| range.sample_format() == format) {
            let sample_rate = default
                .sample_rate()
                .clamp(range.min_sample_rate(), range.max_sample_rate());
            return Ok(range.with_sample_rate(sample_rate));
        }
    }
    Err(AudioError::Unsupported(
        "device exposes neither F32 nor I16 samples".into(),
    ))
}

fn open_input(
    device: cpal::Device,
    supported: SupportedStreamConfig,
    clock: SessionClock,
    gate: Arc<StartGate>,
    limits: AudioQueueLimits,
) -> Result<AudioCapture, AudioError> {
    if limits.packets == 0 || limits.bytes == 0 {
        return Err(AudioError::Unsupported(
            "audio queue limits must be non-zero".into(),
        ));
    }
    let config = supported.config();
    let format = supported.sample_format();
    let (packet_tx, packets) = crossbeam_channel::bounded(limits.packets);
    let (event_tx, events) = crossbeam_channel::bounded(64);
    let (terminal_tx, terminal_events) = crossbeam_channel::bounded(1);
    let queued_bytes = Arc::new(AtomicUsize::new(0));
    let callback_bytes = queued_bytes.clone();
    let mut timeline = AudioTimeline::new(config.sample_rate);
    let mut stopped = false;
    let sample_rate = config.sample_rate;
    let channels = config.channels;
    let event_error = terminal_tx.clone();
    let stream = device
        .build_input_stream_raw(
            config,
            format,
            move |data, info| {
                process_callback(
                    data,
                    info,
                    format,
                    channels,
                    sample_rate,
                    &clock,
                    &gate,
                    limits.bytes,
                    &callback_bytes,
                    &packet_tx,
                    &event_tx,
                    &terminal_tx,
                    &mut timeline,
                    &mut stopped,
                );
            },
            move |error| {
                let event = match error.kind() {
                    cpal::ErrorKind::DeviceNotAvailable => {
                        AudioEvent::Disconnected(error.to_string())
                    }
                    cpal::ErrorKind::DeviceChanged => AudioEvent::DeviceChanged(error.to_string()),
                    _ => AudioEvent::Failed(error.to_string()),
                };
                let _ = event_error.try_send(event);
            },
            Some(Duration::from_secs(10)),
        )
        .map_err(AudioError::from)?;
    stream.play().map_err(AudioError::from)?;
    Ok(AudioCapture {
        stream,
        #[cfg(target_os = "macos")]
        _tap: None,
        packets: AudioPacketQueue::new(packets, queued_bytes, "audio packet producer disconnected"),
        events,
        terminal_events,
        sample_rate,
        channels,
    })
}

#[allow(clippy::too_many_arguments)]
fn process_callback(
    data: &cpal::Data,
    info: &cpal::InputCallbackInfo,
    format: SampleFormat,
    channels: u16,
    sample_rate: u32,
    clock: &SessionClock,
    gate: &StartGate,
    byte_limit: usize,
    queued_bytes: &AtomicUsize,
    packet_tx: &Sender<TimedAudioPacket>,
    event_tx: &Sender<AudioEvent>,
    terminal_tx: &Sender<AudioEvent>,
    timeline: &mut AudioTimeline,
    stopped: &mut bool,
) {
    if *stopped {
        return;
    }
    let Some(session_callback_ns) = gate.session_ns(clock.now_ns()) else {
        return;
    };
    let sample_count = data.len();
    let channel_count = usize::from(channels);
    if sample_count == 0 || channel_count == 0 || !sample_count.is_multiple_of(channel_count) {
        let _ = terminal_tx.try_send(AudioEvent::Failed("invalid audio callback size".into()));
        return;
    }
    let Ok(frames) = u32::try_from(sample_count / channel_count) else {
        let _ = terminal_tx.try_send(AudioEvent::Failed("audio callback is too large".into()));
        return;
    };
    let stamp = info.timestamp();
    let native_capture_ns = u64::try_from(stamp.capture.as_nanos()).unwrap_or(u64::MAX);
    let native_callback_ns = u64::try_from(stamp.callback.as_nanos()).unwrap_or(u64::MAX);
    let timing = match timeline.packet(
        native_capture_ns,
        native_callback_ns,
        session_callback_ns,
        frames,
    ) {
        Ok(timing) => timing,
        Err(error) => {
            let _ = terminal_tx.try_send(AudioEvent::Failed(error.to_string()));
            return;
        }
    };
    if timing.clock_discontinuity {
        let _ = event_tx.try_send(AudioEvent::ClockDiscontinuity {
            first_sample: timing.first_sample,
        });
    }
    if timing.end_ns.saturating_sub(session_callback_ns) > MAX_AUDIO_LEAD_NS {
        *stopped = true;
        let _ = terminal_tx.try_send(AudioEvent::Failed(
            "audio source produced samples faster than real time".into(),
        ));
        return;
    }
    if let Some(anchor) = timing.new_anchor {
        if timing.native_timestamp_usable {
            let _ = event_tx.try_send(AudioEvent::Anchor {
                native_capture_ns: anchor.native_capture_ns,
                native_callback_ns: anchor.native_callback_ns,
                session_ns: anchor.session_ns,
            });
        }
        let _ = event_tx.try_send(AudioEvent::Started);
    }
    let bytes = sample_count.saturating_mul(4);
    if queued_bytes
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |current| {
            current
                .checked_add(bytes)
                .filter(|next| *next <= byte_limit)
        })
        .is_err()
    {
        let _ = event_tx.try_send(AudioEvent::Dropped {
            first_sample: timing.first_sample,
            frames,
        });
        return;
    }
    let samples = match format {
        SampleFormat::F32 => data.as_slice::<f32>().map(|data| data.to_vec()),
        SampleFormat::I16 => data.as_slice::<i16>().map(|data| {
            data.iter()
                .map(|sample| f32::from(*sample) / 32768.0)
                .collect()
        }),
        _ => None,
    };
    let Some(samples) = samples else {
        queued_bytes.fetch_sub(bytes, Ordering::AcqRel);
        let _ = terminal_tx.try_send(AudioEvent::Failed(
            "unsupported callback sample type".into(),
        ));
        return;
    };
    let packet = TimedAudioPacket {
        packet: AudioPacket {
            start_ns: timing.start_ns,
            sample_rate,
            channels,
            frames,
            data: samples,
        },
        first_sample: timing.first_sample,
        native_capture_ns: timing.native_timestamp_usable.then_some(native_capture_ns),
    };
    match packet_tx.try_send(packet) {
        Ok(()) => {}
        Err(TrySendError::Full(_)) => {
            queued_bytes.fetch_sub(bytes, Ordering::AcqRel);
            let _ = event_tx.try_send(AudioEvent::Dropped {
                first_sample: timing.first_sample,
                frames,
            });
        }
        Err(TrySendError::Disconnected(_)) => {
            queued_bytes.fetch_sub(bytes, Ordering::AcqRel);
            let _ = terminal_tx.try_send(AudioEvent::Failed("audio consumer disconnected".into()));
        }
    }
}

#[path = "../test/cpal_capture.rs"]
mod callback_checks;
