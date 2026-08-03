use std::sync::{
    Arc,
    atomic::{AtomicU32, Ordering},
};

use cpal::{
    FromSample, SampleFormat, SizedSample, Stream, StreamConfig,
    traits::{DeviceTrait, HostTrait, StreamTrait},
};

use crate::CaptureError;

const MICROPHONE_PREFIX: &str = "microphone:cpal:";

pub struct NativeAudioLevelMonitor {
    backend: AudioLevelBackend,
}

enum AudioLevelBackend {
    Microphone(MicrophoneLevelMonitor),
    #[cfg(windows)]
    System(WasapiLevelMonitor),
    #[cfg(target_os = "macos")]
    System(ScreenCaptureKitLevelMonitor),
}

impl NativeAudioLevelMonitor {
    pub fn start(source_id: &str) -> Result<Self, CaptureError> {
        let backend = if source_id.starts_with(MICROPHONE_PREFIX) {
            AudioLevelBackend::Microphone(MicrophoneLevelMonitor::start(source_id)?)
        } else {
            #[cfg(windows)]
            {
                AudioLevelBackend::System(WasapiLevelMonitor::start(source_id)?)
            }
            #[cfg(target_os = "macos")]
            {
                AudioLevelBackend::System(ScreenCaptureKitLevelMonitor::start(source_id)?)
            }
        };
        Ok(Self { backend })
    }

    #[must_use]
    pub fn take_level(&self) -> f32 {
        match &self.backend {
            AudioLevelBackend::Microphone(monitor) => monitor.take_level(),
            #[cfg(windows)]
            AudioLevelBackend::System(monitor) => monitor.take_level(),
            #[cfg(target_os = "macos")]
            AudioLevelBackend::System(monitor) => monitor.take_level(),
        }
    }
}

#[derive(Default)]
struct LevelAccumulator {
    peak_bits: AtomicU32,
}

impl LevelAccumulator {
    fn observe(&self, samples: &[f32]) {
        if samples.is_empty() {
            return;
        }
        let sum = samples.iter().fold(0.0f64, |total, sample| {
            let value = f64::from(sample.clamp(-1.0, 1.0));
            total + value * value
        });
        let rms = (sum / samples.len() as f64).sqrt() as f32;
        let candidate = (rms * 4.0).clamp(0.0, 1.0).to_bits();
        let mut current = self.peak_bits.load(Ordering::Relaxed);
        while candidate > current {
            match self.peak_bits.compare_exchange_weak(
                current,
                candidate,
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(next) => current = next,
            }
        }
    }

    fn take(&self) -> f32 {
        f32::from_bits(self.peak_bits.swap(0, Ordering::Relaxed)).clamp(0.0, 1.0)
    }
}

struct MicrophoneLevelMonitor {
    _stream: Stream,
    level: Arc<LevelAccumulator>,
}

impl MicrophoneLevelMonitor {
    fn start(source_id: &str) -> Result<Self, CaptureError> {
        let requested = source_id.strip_prefix(MICROPHONE_PREFIX).ok_or_else(|| {
            CaptureError::InvalidConfiguration(format!(
                "{source_id} is not a native microphone source"
            ))
        })?;
        let host = cpal::default_host();
        let device = host
            .input_devices()
            .map_err(backend_error)?
            .find(|device| {
                device
                    .id()
                    .is_ok_and(|id| id.to_string() == requested)
            })
            .ok_or_else(|| CaptureError::SourceNotFound(source_id.into()))?;
        let supported = device.default_input_config().map_err(backend_error)?;
        let config: StreamConfig = supported.clone().into();
        let level = Arc::new(LevelAccumulator::default());
        let stream = build_input_stream(
            &device,
            &config,
            supported.sample_format(),
            level.clone(),
        )?;
        stream.play().map_err(backend_error)?;
        Ok(Self {
            _stream: stream,
            level,
        })
    }

    fn take_level(&self) -> f32 {
        self.level.take()
    }
}

fn build_input_stream(
    device: &cpal::Device,
    config: &StreamConfig,
    format: SampleFormat,
    level: Arc<LevelAccumulator>,
) -> Result<Stream, CaptureError> {
    macro_rules! build {
        ($sample:ty) => {{
            let callback_level = level.clone();
            device
                .build_input_stream(
                    config.clone(),
                    move |data: &[$sample], _| observe_samples(data, &callback_level),
                    move |_error| {},
                    None,
                )
                .map_err(backend_error)
        }};
    }
    match format {
        SampleFormat::I8 => build!(i8),
        SampleFormat::I16 => build!(i16),
        SampleFormat::I24 => build!(cpal::I24),
        SampleFormat::I32 => build!(i32),
        SampleFormat::I64 => build!(i64),
        SampleFormat::U8 => build!(u8),
        SampleFormat::U16 => build!(u16),
        SampleFormat::U24 => build!(cpal::U24),
        SampleFormat::U32 => build!(u32),
        SampleFormat::U64 => build!(u64),
        SampleFormat::F32 => build!(f32),
        SampleFormat::F64 => build!(f64),
        _ => Err(CaptureError::Unsupported(format!(
            "audio sample format {format} is not supported"
        ))),
    }
}

fn observe_samples<T>(samples: &[T], level: &LevelAccumulator)
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let converted = samples
        .iter()
        .map(|sample| sample.to_sample::<f32>())
        .collect::<Vec<_>>();
    level.observe(&converted);
}

#[cfg(windows)]
use std::{
    collections::VecDeque,
    sync::mpsc,
    thread::{self, JoinHandle},
    time::Duration,
};
#[cfg(windows)]
use crossbeam_channel::{Receiver, Sender, TryRecvError, bounded};
#[cfg(windows)]
use wasapi::{
    DeviceEnumerator, Direction, SampleType, StreamMode, WasapiError, WaveFormat, deinitialize,
    initialize_mta,
};

#[cfg(windows)]
const WASAPI_PREFIX: &str = "system-audio:wasapi:";

#[cfg(windows)]
struct WasapiLevelMonitor {
    stop: Option<Sender<()>>,
    thread: Option<JoinHandle<()>>,
    level: Arc<LevelAccumulator>,
}

#[cfg(windows)]
impl WasapiLevelMonitor {
    fn start(source_id: &str) -> Result<Self, CaptureError> {
        let endpoint_id = source_id
            .strip_prefix(WASAPI_PREFIX)
            .ok_or_else(|| {
                CaptureError::InvalidConfiguration(format!(
                    "{source_id} is not a WASAPI loopback source"
                ))
            })?
            .to_owned();
        let level = Arc::new(LevelAccumulator::default());
        let callback_level = level.clone();
        let (stop_sender, stop_receiver) = bounded(1);
        let (ready_sender, ready_receiver) = mpsc::channel();
        let thread = thread::Builder::new()
            .name("capture-wasapi-level".into())
            .spawn(move || {
                let _ = wasapi_level_loop(
                    &endpoint_id,
                    callback_level,
                    stop_receiver,
                    ready_sender,
                );
            })
            .map_err(backend_error)?;
        match ready_receiver.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(())) => Ok(Self {
                stop: Some(stop_sender),
                thread: Some(thread),
                level,
            }),
            Ok(Err(message)) => {
                let _ = stop_sender.send(());
                let _ = thread.join();
                Err(CaptureError::Backend(message))
            }
            Err(error) => {
                let _ = stop_sender.send(());
                let _ = thread.join();
                Err(CaptureError::Backend(format!(
                    "WASAPI level monitor did not initialize: {error}"
                )))
            }
        }
    }

    fn take_level(&self) -> f32 {
        self.level.take()
    }
}

#[cfg(windows)]
impl Drop for WasapiLevelMonitor {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[cfg(windows)]
fn wasapi_level_loop(
    endpoint_id: &str,
    level: Arc<LevelAccumulator>,
    stop: Receiver<()>,
    ready: mpsc::Sender<Result<(), String>>,
) -> Result<(), CaptureError> {
    let initialized = (|| {
        let apartment = ComApartment::initialize()?;
        let enumerator = DeviceEnumerator::new().map_err(backend_error)?;
        let device = enumerator.get_device(endpoint_id).map_err(backend_error)?;
        let mut client = device.get_iaudioclient().map_err(backend_error)?;
        let format = WaveFormat::new(
            32,
            32,
            &SampleType::Float,
            48_000,
            2,
            None,
        );
        let (_, minimum_period) = client.get_device_period().map_err(backend_error)?;
        client
            .initialize_client(
                &format,
                &Direction::Capture,
                &StreamMode::EventsShared {
                    autoconvert: true,
                    buffer_duration_hns: minimum_period,
                },
            )
            .map_err(backend_error)?;
        let event = client.set_get_eventhandle().map_err(backend_error)?;
        let capture = client.get_audiocaptureclient().map_err(backend_error)?;
        client.start_stream().map_err(backend_error)?;
        Ok::<_, CaptureError>((apartment, client, event, capture))
    })();

    let (_apartment, client, event, capture) = match initialized {
        Ok(value) => {
            let _ = ready.send(Ok(()));
            value
        }
        Err(error) => {
            let _ = ready.send(Err(error.to_string()));
            return Err(error);
        }
    };

    let mut bytes = VecDeque::new();
    let result = (|| loop {
        match stop.try_recv() {
            Ok(()) | Err(TryRecvError::Disconnected) => return Ok(()),
            Err(TryRecvError::Empty) => {}
        }
        match event.wait_for_event(250) {
            Ok(()) => {}
            Err(WasapiError::EventTimeout) => continue,
            Err(error) => return Err(backend_error(error)),
        }
        loop {
            let packet_size = capture.get_next_packet_size().map_err(backend_error)?;
            if !packet_size.is_some_and(|frames| frames > 0) {
                break;
            }
            capture
                .read_from_device_to_deque(&mut bytes)
                .map_err(backend_error)?;
            level.observe(&drain_level_f32(&mut bytes));
        }
    })();
    let stop_result = client.stop_stream().map_err(backend_error);
    result.and(stop_result)
}

#[cfg(windows)]
fn drain_level_f32(bytes: &mut VecDeque<u8>) -> Vec<f32> {
    let complete_bytes = bytes.len() - bytes.len() % size_of::<f32>();
    let mut samples = Vec::with_capacity(complete_bytes / size_of::<f32>());
    for _ in 0..(complete_bytes / size_of::<f32>()) {
        let mut sample = [0u8; size_of::<f32>()];
        for byte in &mut sample {
            if let Some(value) = bytes.pop_front() {
                *byte = value;
            }
        }
        samples.push(f32::from_le_bytes(sample));
    }
    samples
}

#[cfg(windows)]
struct ComApartment;

#[cfg(windows)]
impl ComApartment {
    fn initialize() -> Result<Self, CaptureError> {
        initialize_mta()
            .ok()
            .map_err(|error| backend_error(format!("COM init failed: {error}")))?;
        Ok(Self)
    }
}

#[cfg(windows)]
impl Drop for ComApartment {
    fn drop(&mut self) {
        deinitialize();
    }
}

#[cfg(target_os = "macos")]
use screencapturekit::{
    cm::{AudioBufferList, CMSampleBuffer, CMSampleBufferExt},
    shareable_content::SCShareableContent,
    stream::{
        SCStream,
        configuration::SCStreamConfiguration,
        content_filter::SCContentFilter,
        output_type::SCStreamOutputType,
    },
};

#[cfg(target_os = "macos")]
const SCK_SOURCE_ID: &str = "system-audio:sck:default";

#[cfg(target_os = "macos")]
struct ScreenCaptureKitLevelMonitor {
    stream: Option<SCStream>,
    handler: usize,
    level: Arc<LevelAccumulator>,
}

#[cfg(target_os = "macos")]
impl ScreenCaptureKitLevelMonitor {
    fn start(source_id: &str) -> Result<Self, CaptureError> {
        if source_id != SCK_SOURCE_ID {
            return Err(CaptureError::InvalidConfiguration(format!(
                "{source_id} is not a ScreenCaptureKit system-audio source"
            )));
        }
        let content = SCShareableContent::get().map_err(backend_error)?;
        let display = content
            .displays()
            .into_iter()
            .next()
            .ok_or_else(|| CaptureError::SourceNotFound("primary display".into()))?;
        let filter = SCContentFilter::create()
            .with_display(&display)
            .with_excluding_windows(&[])
            .build();
        let configuration = SCStreamConfiguration::new()
            .with_width(2)
            .with_height(2)
            .with_queue_depth(3)
            .with_captures_audio(true)
            .with_excludes_current_process_audio(true)
            .with_sample_rate(48_000)
            .with_channel_count(2);
        let level = Arc::new(LevelAccumulator::default());
        let callback_level = level.clone();
        let mut stream = SCStream::new(&filter, &configuration);
        let handler = stream
            .add_output_handler(
                move |sample: CMSampleBuffer, output_type| {
                    if output_type != SCStreamOutputType::Audio || !sample.data_is_ready() {
                        return;
                    }
                    if let Some(list) = sample.audio_buffer_list() {
                        callback_level.observe(&interleaved_level_f32(&list));
                    }
                },
                SCStreamOutputType::Audio,
            )
            .ok_or_else(|| {
                CaptureError::Backend(
                    "ScreenCaptureKit rejected the audio-level output handler".into(),
                )
            })?;
        if let Err(error) = stream.start_capture() {
            let _ = stream.remove_output_handler(handler, SCStreamOutputType::Audio);
            return Err(backend_error(error));
        }
        Ok(Self {
            stream: Some(stream),
            handler,
            level,
        })
    }

    fn take_level(&self) -> f32 {
        self.level.take()
    }
}

#[cfg(target_os = "macos")]
impl Drop for ScreenCaptureKitLevelMonitor {
    fn drop(&mut self) {
        if let Some(mut stream) = self.stream.take() {
            let _ = stream.stop_capture();
            let _ = stream.remove_output_handler(self.handler, SCStreamOutputType::Audio);
        }
    }
}

#[cfg(target_os = "macos")]
fn interleaved_level_f32(list: &AudioBufferList) -> Vec<f32> {
    let buffers = list.iter().collect::<Vec<_>>();
    if buffers.is_empty() {
        return Vec::new();
    }
    if buffers.len() == 1 {
        return decode_level_f32(buffers[0].data());
    }
    let planar = buffers
        .iter()
        .map(|buffer| decode_level_f32(buffer.data()))
        .collect::<Vec<_>>();
    let frames = planar.iter().map(Vec::len).min().unwrap_or_default();
    let mut samples = Vec::with_capacity(frames.saturating_mul(planar.len()));
    for frame in 0..frames {
        for channel in &planar {
            samples.push(channel[frame]);
        }
    }
    samples
}

#[cfg(target_os = "macos")]
fn decode_level_f32(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(size_of::<f32>())
        .map(|sample| f32::from_ne_bytes([sample[0], sample[1], sample[2], sample[3]]))
        .collect()
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("native audio level monitor failed: {error}"))
}
