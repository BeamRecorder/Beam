use std::{
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    thread::{self, JoinHandle},
};

use cpal::{
    FromSample, SampleFormat, SizedSample, Stream, StreamConfig, SupportedStreamConfig,
    traits::{DeviceTrait, HostTrait, StreamTrait},
};
use crossbeam_channel::{Receiver, Sender, TrySendError, bounded};

use crate::{
    CaptureError,
    model::{
        MediaFormat, SourceCapabilities, SourceDescriptor, SourceId, SourceKind,
        SourceSelectionMode,
    },
    session::StartGate,
    storage::WavWriter,
};

enum AudioMessage {
    Samples(Vec<f32>),
    Stop,
}

#[derive(Debug, Default)]
pub struct AudioCaptureMetrics {
    samples_received: AtomicU64,
    samples_dropped: AtomicU64,
    interruptions: AtomicU64,
}

pub fn discover_sources() -> Result<Vec<SourceDescriptor>, CaptureError> {
    let host = cpal::default_host();
    let default_input = host
        .default_input_device()
        .and_then(|device| device.id().ok())
        .map(|id| id.to_string());
    let default_output = host
        .default_output_device()
        .and_then(|device| device.id().ok())
        .map(|id| id.to_string());
    let mut sources = Vec::new();
    for device in host
        .devices()
        .map_err(|error| CaptureError::Backend(error.to_string()))?
    {
        let id = device
            .id()
            .map_err(|error| CaptureError::Backend(error.to_string()))?
            .to_string();
        let label = device
            .description()
            .map_err(|error| CaptureError::Backend(error.to_string()))?
            .to_string();
        if let Ok(config) = device.default_input_config() {
            sources.push(audio_source(
                format!("microphone:cpal:{id}"),
                SourceKind::Microphone,
                label.clone(),
                default_input.as_deref() == Some(id.as_str()),
                &config,
            )?);
        }
        if let Ok(config) = device.default_output_config() {
            sources.push(audio_source(
                format!("system-audio:cpal:{id}"),
                SourceKind::SystemAudio,
                label,
                default_output.as_deref() == Some(id.as_str()),
                &config,
            )?);
        }
    }
    Ok(sources)
}

fn audio_source(
    id: String,
    kind: SourceKind,
    label: String,
    is_default: bool,
    config: &SupportedStreamConfig,
) -> Result<SourceDescriptor, CaptureError> {
    SourceId::new(id).map(|id| SourceDescriptor {
        id,
        kind,
        label,
        is_default,
        selection_mode: SourceSelectionMode::Direct,
        display_id: None,
        capabilities: SourceCapabilities {
            formats: vec![MediaFormat::Audio {
                sample_rate: config.sample_rate(),
                channels: config.channels(),
                sample_format: "f32".into(),
            }],
            ..SourceCapabilities::default()
        },
    })
}

impl AudioCaptureMetrics {
    #[must_use]
    pub fn samples_received(&self) -> u64 {
        self.samples_received.load(Ordering::Relaxed)
    }
    #[must_use]
    pub fn samples_dropped(&self) -> u64 {
        self.samples_dropped.load(Ordering::Relaxed)
    }
    #[must_use]
    pub fn interruptions(&self) -> u64 {
        self.interruptions.load(Ordering::Relaxed)
    }
}

pub struct CpalAudioRecording {
    stream: Option<Stream>,
    sender: Option<Sender<AudioMessage>>,
    writer: Option<JoinHandle<Result<u64, CaptureError>>>,
    metrics: Arc<AudioCaptureMetrics>,
    output: PathBuf,
}

impl CpalAudioRecording {
    pub fn start(
        source_id: &str,
        kind: SourceKind,
        output: &Path,
        queue_capacity: usize,
        start_gate: Arc<StartGate>,
    ) -> Result<Self, CaptureError> {
        if queue_capacity == 0 {
            return Err(CaptureError::InvalidConfiguration(
                "audio queue capacity must be non-zero".into(),
            ));
        }
        let host = cpal::default_host();
        let device = find_device(&host, source_id, kind)?;
        let (supported, stream_config) = stream_configuration(&device, kind)?;
        let sample_rate = supported.sample_rate();
        let channels = supported.channels();
        let (sender, receiver) = bounded(queue_capacity);
        let metrics = Arc::new(AudioCaptureMetrics::default());
        let worker_metrics = metrics.clone();
        let path = output.to_owned();
        let writer_path = path.clone();
        let writer = thread::Builder::new()
            .name(format!(
                "capture-audio-writer-{}",
                source_id.replace(':', "-")
            ))
            .spawn(move || {
                write_audio(receiver, writer_path, sample_rate, channels, worker_metrics)
            })
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        let callback_metrics = metrics.clone();
        let callback_sender = sender.clone();
        let callback_gate = start_gate;
        let error_metrics = metrics.clone();
        let error_callback = move |_error| {
            error_metrics.interruptions.fetch_add(1, Ordering::Relaxed);
        };
        let stream = match build_stream(
            &device,
            &stream_config,
            supported.sample_format(),
            move |data: &[f32]| {
                if !callback_gate.is_released() {
                    callback_metrics
                        .samples_dropped
                        .fetch_add(data.len() as u64, Ordering::Relaxed);
                    return;
                }
                callback_metrics
                    .samples_received
                    .fetch_add(data.len() as u64, Ordering::Relaxed);
                match callback_sender.try_send(AudioMessage::Samples(data.to_vec())) {
                    Ok(()) => {}
                    Err(TrySendError::Full(AudioMessage::Samples(samples))) => {
                        callback_metrics
                            .samples_dropped
                            .fetch_add(samples.len() as u64, Ordering::Relaxed);
                    }
                    Err(TrySendError::Disconnected(_))
                    | Err(TrySendError::Full(AudioMessage::Stop)) => {
                        callback_metrics
                            .interruptions
                            .fetch_add(1, Ordering::Relaxed);
                    }
                }
            },
            error_callback,
        ) {
            Ok(stream) => stream,
            Err(error) => {
                let _ = sender.send(AudioMessage::Stop);
                let _ = writer.join();
                let _ = std::fs::remove_file(output);
                return Err(error);
            }
        };
        if let Err(error) = stream.play() {
            let _ = sender.send(AudioMessage::Stop);
            let _ = writer.join();
            let _ = std::fs::remove_file(output);
            return Err(CaptureError::Backend(error.to_string()));
        }
        Ok(Self {
            stream: Some(stream),
            sender: Some(sender),
            writer: Some(writer),
            metrics,
            output: path,
        })
    }

    pub fn stop(mut self) -> Result<(), CaptureError> {
        self.stream.take();
        if let Some(sender) = self.sender.take() {
            sender.send(AudioMessage::Stop).map_err(|_| {
                CaptureError::Backend("audio writer stopped before finalization".into())
            })?;
        }
        let size = self
            .writer
            .take()
            .ok_or_else(|| CaptureError::Backend("audio writer handle missing".into()))?
            .join()
            .map_err(|_| CaptureError::Backend("audio writer panicked".into()))??;
        if size <= 44 {
            let _ = std::fs::remove_file(&self.output);
            return Err(CaptureError::Backend(
                "native audio produced an empty WAV segment".into(),
            ));
        }
        Ok(())
    }

    #[must_use]
    pub fn metrics(&self) -> Arc<AudioCaptureMetrics> {
        self.metrics.clone()
    }
}

impl Drop for CpalAudioRecording {
    fn drop(&mut self) {
        self.stream.take();
        if let Some(sender) = self.sender.take() {
            let _ = sender.send(AudioMessage::Stop);
        }
        if let Some(writer) = self.writer.take() {
            let _ = writer.join();
        }
    }
}

fn write_audio(
    receiver: Receiver<AudioMessage>,
    output: PathBuf,
    sample_rate: u32,
    channels: u16,
    metrics: Arc<AudioCaptureMetrics>,
) -> Result<u64, CaptureError> {
    let mut writer = WavWriter::create(&output, sample_rate, channels)?;
    while let Ok(message) = receiver.recv() {
        match message {
            AudioMessage::Samples(samples) => writer.write_f32(&samples)?,
            AudioMessage::Stop => break,
        }
    }
    let result = writer.finish();
    if result.is_err() {
        metrics.interruptions.fetch_add(1, Ordering::Relaxed);
    }
    result
}

fn find_device(
    host: &cpal::Host,
    source_id: &str,
    kind: SourceKind,
) -> Result<cpal::Device, CaptureError> {
    let requested = match kind {
        SourceKind::Microphone => source_id
            .strip_prefix("microphone:cpal:")
            .unwrap_or(source_id),
        SourceKind::SystemAudio => source_id
            .strip_prefix("system-audio:cpal:")
            .unwrap_or(source_id),
        _ => source_id,
    };
    let devices = host
        .devices()
        .map_err(|error| CaptureError::Backend(error.to_string()))?;
    devices
        .filter(|device| match kind {
            SourceKind::SystemAudio => device.supports_output(),
            _ => device.supports_input(),
        })
        .find(|device| {
            device
                .id()
                .map(|id| id.to_string() == requested)
                .unwrap_or(false)
                || device
                    .description()
                    .map(|name| name.to_string() == requested)
                    .unwrap_or(false)
        })
        .or_else(|| match kind {
            SourceKind::SystemAudio => host.default_output_device(),
            _ => host.default_input_device(),
        })
        .ok_or_else(|| CaptureError::SourceNotFound(source_id.into()))
}

fn stream_configuration(
    device: &cpal::Device,
    kind: SourceKind,
) -> Result<(SupportedStreamConfig, StreamConfig), CaptureError> {
    let supported = match kind {
        SourceKind::SystemAudio => device.default_output_config(),
        _ => device.default_input_config(),
    }
    .map_err(|error| CaptureError::Backend(error.to_string()))?;
    let stream_config = supported.into();
    Ok((supported, stream_config))
}

fn build_stream<D, E>(
    device: &cpal::Device,
    config: &StreamConfig,
    format: SampleFormat,
    mut on_data: D,
    on_error: E,
) -> Result<Stream, CaptureError>
where
    D: FnMut(&[f32]) + Send + 'static,
    E: FnMut(cpal::Error) + Send + 'static,
{
    macro_rules! build {
        ($sample:ty) => {{
            device
                .build_input_stream(
                    config.clone(),
                    move |data: &[$sample], _| convert_samples(data, &mut on_data),
                    on_error,
                    None,
                )
                .map_err(|error| CaptureError::Backend(error.to_string()))
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

fn convert_samples<T>(data: &[T], on_data: &mut impl FnMut(&[f32]))
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let samples = data
        .iter()
        .map(|sample| sample.to_sample::<f32>())
        .collect::<Vec<f32>>();
    on_data(&samples);
}
