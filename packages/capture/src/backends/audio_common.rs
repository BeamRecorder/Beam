use std::{
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    thread::{self, JoinHandle},
};

use cpal::{
    FromSample, SampleFormat, SizedSample, Stream, StreamConfig,
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

    pub(crate) fn record_received(&self, samples: usize) {
        self.samples_received.fetch_add(
            u64::try_from(samples).unwrap_or(u64::MAX),
            Ordering::Relaxed,
        );
    }

    pub(crate) fn record_dropped(&self, samples: usize) {
        self.samples_dropped.fetch_add(
            u64::try_from(samples).unwrap_or(u64::MAX),
            Ordering::Relaxed,
        );
    }

    pub(crate) fn record_interruption(&self) {
        self.interruptions.fetch_add(1, Ordering::Relaxed);
    }
}

pub fn discover_microphones() -> Result<Vec<SourceDescriptor>, CaptureError> {
    let host = cpal::default_host();
    let default_input = host
        .default_input_device()
        .and_then(|device| device.id().ok())
        .map(|id| id.to_string());
    let mut sources = Vec::new();
    for device in host
        .input_devices()
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
        let config = device
            .default_input_config()
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        sources.push(SourceDescriptor {
            id: SourceId::new(format!("microphone:cpal:{id}"))?,
            kind: SourceKind::Microphone,
            label,
            is_default: default_input.as_deref() == Some(id.as_str()),
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
        });
    }
    Ok(sources)
}

#[derive(Clone)]
pub(crate) struct AudioPublisher {
    sender: Sender<AudioMessage>,
    metrics: Arc<AudioCaptureMetrics>,
}

impl AudioPublisher {
    pub(crate) fn publish(&self, samples: Vec<f32>) {
        self.metrics.record_received(samples.len());
        match self.sender.try_send(AudioMessage::Samples(samples)) {
            Ok(()) => {}
            Err(TrySendError::Full(AudioMessage::Samples(samples))) => {
                self.metrics.record_dropped(samples.len());
            }
            Err(TrySendError::Disconnected(_)) | Err(TrySendError::Full(AudioMessage::Stop)) => {
                self.metrics.record_interruption();
            }
        }
    }

    pub(crate) fn interruption(&self) {
        self.metrics.record_interruption();
    }
}

pub(crate) struct AudioSink {
    sender: Option<Sender<AudioMessage>>,
    writer: Option<JoinHandle<Result<u64, CaptureError>>>,
    metrics: Arc<AudioCaptureMetrics>,
    output: PathBuf,
}

impl AudioSink {
    pub(crate) fn start(
        output: &Path,
        sample_rate: u32,
        channels: u16,
        queue_capacity: usize,
        thread_name: &str,
    ) -> Result<(Self, AudioPublisher), CaptureError> {
        if queue_capacity == 0 {
            return Err(CaptureError::InvalidConfiguration(
                "audio queue capacity must be non-zero".into(),
            ));
        }
        if sample_rate == 0 || channels == 0 {
            return Err(CaptureError::InvalidConfiguration(
                "audio sample rate and channel count must be non-zero".into(),
            ));
        }
        if output.exists() {
            std::fs::remove_file(output)
                .map_err(|error| CaptureError::storage(output, error))?;
        }
        let (sender, receiver) = bounded(queue_capacity);
        let metrics = Arc::new(AudioCaptureMetrics::default());
        let writer_metrics = metrics.clone();
        let writer_path = output.to_owned();
        let writer = thread::Builder::new()
            .name(thread_name.into())
            .spawn(move || {
                write_audio(
                    receiver,
                    writer_path,
                    sample_rate,
                    channels,
                    writer_metrics,
                )
            })
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        let publisher = AudioPublisher {
            sender: sender.clone(),
            metrics: metrics.clone(),
        };
        Ok((
            Self {
                sender: Some(sender),
                writer: Some(writer),
                metrics,
                output: output.to_owned(),
            },
            publisher,
        ))
    }

    pub(crate) fn stop(mut self) -> Result<(), CaptureError> {
        self.finish()
    }

    #[must_use]
    pub(crate) fn metrics(&self) -> Arc<AudioCaptureMetrics> {
        self.metrics.clone()
    }

    fn finish(&mut self) -> Result<(), CaptureError> {
        if let Some(sender) = self.sender.take() {
            let _ = sender.send(AudioMessage::Stop);
        }
        let Some(writer) = self.writer.take() else {
            return Ok(());
        };
        let size = writer
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
}

impl Drop for AudioSink {
    fn drop(&mut self) {
        self.sender.take();
        if let Some(writer) = self.writer.take() {
            let _ = writer.join();
        }
    }
}

pub struct MicrophoneRecording {
    stream: Option<Stream>,
    sink: Option<AudioSink>,
}

impl MicrophoneRecording {
    pub fn start(
        source_id: &str,
        output: &Path,
        queue_capacity: usize,
        start_gate: Arc<StartGate>,
    ) -> Result<Self, CaptureError> {
        let host = cpal::default_host();
        let device = find_microphone(&host, source_id)?;
        let supported = device
            .default_input_config()
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        let stream_config: StreamConfig = supported.clone().into();
        let (sink, publisher) = AudioSink::start(
            output,
            supported.sample_rate(),
            supported.channels(),
            queue_capacity,
            "capture-microphone-writer",
        )?;
        let error_publisher = publisher.clone();
        let callback_gate = start_gate;
        let stream = match build_stream(
            &device,
            &stream_config,
            supported.sample_format(),
            move |data: &[f32]| {
                if callback_gate.is_released() {
                    publisher.publish(data.to_vec());
                }
            },
            move |_error| error_publisher.interruption(),
        ) {
            Ok(stream) => stream,
            Err(error) => {
                drop(sink);
                let _ = std::fs::remove_file(output);
                return Err(error);
            }
        };
        if let Err(error) = stream.play() {
            drop(stream);
            drop(sink);
            let _ = std::fs::remove_file(output);
            return Err(CaptureError::Backend(error.to_string()));
        }
        Ok(Self {
            stream: Some(stream),
            sink: Some(sink),
        })
    }

    pub fn stop(mut self) -> Result<(), CaptureError> {
        self.stream.take();
        self.sink
            .take()
            .ok_or_else(|| CaptureError::Backend("microphone audio sink missing".into()))?
            .stop()
    }

    #[must_use]
    pub fn metrics(&self) -> Arc<AudioCaptureMetrics> {
        self.sink
            .as_ref()
            .map_or_else(|| Arc::new(AudioCaptureMetrics::default()), AudioSink::metrics)
    }
}

fn write_audio(
    receiver: Receiver<AudioMessage>,
    output: PathBuf,
    sample_rate: u32,
    channels: u16,
    metrics: Arc<AudioCaptureMetrics>,
) -> Result<u64, CaptureError> {
    let result = (|| {
        let mut writer = WavWriter::create(&output, sample_rate, channels)?;
        while let Ok(message) = receiver.recv() {
            match message {
                AudioMessage::Samples(samples) => writer.write_f32(&samples)?,
                AudioMessage::Stop => break,
            }
        }
        writer.finish()
    })();
    if result.is_err() {
        metrics.record_interruption();
    }
    result
}

fn find_microphone(host: &cpal::Host, source_id: &str) -> Result<cpal::Device, CaptureError> {
    let requested = source_id
        .strip_prefix("microphone:cpal:")
        .ok_or_else(|| {
            CaptureError::InvalidConfiguration(format!(
                "{source_id} is not a native microphone source"
            ))
        })?;
    host.input_devices()
        .map_err(|error| CaptureError::Backend(error.to_string()))?
        .find(|device| {
            device
                .id()
                .is_ok_and(|id| id.to_string() == requested)
        })
        .ok_or_else(|| CaptureError::SourceNotFound(source_id.into()))
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
