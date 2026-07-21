use std::{
    path::Path,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    thread::JoinHandle,
};

use cpal::{
    FromSample, Sample, SampleFormat, SizedSample, Stream, StreamConfig, SupportedStreamConfig,
    traits::{DeviceTrait, HostTrait, StreamTrait},
};
use crossbeam_channel::{Sender, TrySendError, bounded};

use crate::{
    CaptureError, audio::WavSegmentWriter, model::MicrophoneSelection, session::StartGate,
};

#[derive(Debug, Default)]
pub struct MicrophoneMetrics {
    samples_received: AtomicU64,
    samples_dropped: AtomicU64,
    interruptions: AtomicU64,
}

impl MicrophoneMetrics {
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

pub struct MicrophoneRecording {
    stream: Option<Stream>,
    sender: Option<Sender<Vec<f32>>>,
    writer: Option<JoinHandle<Result<u64, CaptureError>>>,
    metrics: Arc<MicrophoneMetrics>,
    error: Arc<Mutex<Option<String>>>,
    sample_rate: u32,
    channels: u16,
}

impl MicrophoneRecording {
    pub fn start(
        selection: &MicrophoneSelection,
        output: &Path,
        queue_capacity: usize,
        start_gate: Arc<StartGate>,
    ) -> Result<Self, CaptureError> {
        if queue_capacity == 0 {
            return Err(CaptureError::InvalidConfiguration(
                "microphone queue capacity must be non-zero".into(),
            ));
        }
        let host = cpal::default_host();
        let device = host
            .input_devices()
            .map_err(backend_error)?
            .find(|device| {
                device
                    .id()
                    .is_ok_and(|id| selection.source_id.as_str() == format!("cpal:{id}"))
            })
            .ok_or_else(|| CaptureError::SourceNotFound(selection.source_id.to_string()))?;
        let config = choose_config(&device, selection)?;
        let sample_rate = config.sample_rate();
        let channels = config.channels();
        let (sender, receiver) = bounded::<Vec<f32>>(queue_capacity);
        let (writer_ready_sender, writer_ready_receiver) = std::sync::mpsc::sync_channel(1);
        let output = output.to_owned();
        let writer = std::thread::Builder::new()
            .name("capture-microphone-writer".into())
            .spawn(move || {
                let mut writer = match WavSegmentWriter::create(&output, sample_rate, channels) {
                    Ok(writer) => {
                        let _sent = writer_ready_sender.send(Ok(()));
                        writer
                    }
                    Err(error) => {
                        let _sent = writer_ready_sender.send(Err(error.to_string()));
                        return Err(error);
                    }
                };
                while let Ok(samples) = receiver.recv() {
                    writer.write(&samples)?;
                }
                let count = writer.samples_written();
                writer.finalize()?;
                Ok(count)
            })
            .map_err(backend_error)?;
        if let Err(message) = writer_ready_receiver
            .recv()
            .map_err(|_| CaptureError::Backend("microphone writer startup channel closed".into()))?
        {
            drop(sender);
            let _joined = writer.join();
            return Err(CaptureError::Backend(message));
        }
        let metrics = Arc::new(MicrophoneMetrics::default());
        let error = Arc::new(Mutex::new(None));
        let stream = build_stream(
            &device,
            &config,
            sender.clone(),
            metrics.clone(),
            error.clone(),
            start_gate,
        )?;
        stream.play().map_err(backend_error)?;
        Ok(Self {
            stream: Some(stream),
            sender: Some(sender),
            writer: Some(writer),
            metrics,
            error,
            sample_rate,
            channels,
        })
    }

    pub fn stop(mut self) -> Result<u64, CaptureError> {
        self.finish()
    }

    #[must_use]
    pub fn metrics(&self) -> Arc<MicrophoneMetrics> {
        self.metrics.clone()
    }
    #[must_use]
    pub const fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
    #[must_use]
    pub const fn channels(&self) -> u16 {
        self.channels
    }

    fn finish(&mut self) -> Result<u64, CaptureError> {
        if let Some(stream) = self.stream.take() {
            stream.pause().map_err(backend_error)?;
            drop(stream);
        }
        self.sender.take();
        let samples = if let Some(writer) = self.writer.take() {
            writer
                .join()
                .map_err(|_| CaptureError::Backend("microphone writer thread panicked".into()))??
        } else {
            self.metrics.samples_received()
        };
        let error = self
            .error
            .lock()
            .map_err(|_| CaptureError::Backend("microphone error lock poisoned".into()))?
            .take();
        if let Some(error) = error {
            return Err(CaptureError::Backend(error));
        }
        Ok(samples)
    }
}

impl Drop for MicrophoneRecording {
    fn drop(&mut self) {
        let _result = self.finish();
    }
}

fn choose_config(
    device: &cpal::Device,
    selection: &MicrophoneSelection,
) -> Result<SupportedStreamConfig, CaptureError> {
    let preferred_rate = selection.preferred_sample_rate;
    let preferred_channels = selection.preferred_channels;
    if preferred_rate.is_none() && preferred_channels.is_none() {
        return device.default_input_config().map_err(backend_error);
    }
    device
        .supported_input_configs()
        .map_err(backend_error)?
        .map(|range| {
            let rate = preferred_rate
                .unwrap_or(range.max_sample_rate())
                .clamp(range.min_sample_rate(), range.max_sample_rate());
            let score = u64::from(preferred_rate.unwrap_or(rate).abs_diff(rate))
                + u64::from(
                    preferred_channels
                        .unwrap_or(range.channels())
                        .abs_diff(range.channels()),
                ) * 100_000;
            (score, range.with_sample_rate(rate))
        })
        .min_by_key(|(score, _)| *score)
        .map(|(_, config)| config)
        .ok_or_else(|| CaptureError::Unsupported("microphone has no input format".into()))
}

fn build_stream(
    device: &cpal::Device,
    supported: &SupportedStreamConfig,
    sender: Sender<Vec<f32>>,
    metrics: Arc<MicrophoneMetrics>,
    error: Arc<Mutex<Option<String>>>,
    start_gate: Arc<StartGate>,
) -> Result<Stream, CaptureError> {
    let config: StreamConfig = (*supported).into();
    macro_rules! stream {
        ($sample:ty) => {
            build_typed_stream::<$sample>(device, &config, sender, metrics, error, start_gate)
        };
    }
    match supported.sample_format() {
        SampleFormat::I8 => stream!(i8),
        SampleFormat::I16 => stream!(i16),
        SampleFormat::I24 => stream!(cpal::I24),
        SampleFormat::I32 => stream!(i32),
        SampleFormat::I64 => stream!(i64),
        SampleFormat::U8 => stream!(u8),
        SampleFormat::U16 => stream!(u16),
        SampleFormat::U24 => stream!(cpal::U24),
        SampleFormat::U32 => stream!(u32),
        SampleFormat::U64 => stream!(u64),
        SampleFormat::F32 => stream!(f32),
        SampleFormat::F64 => stream!(f64),
        format => Err(CaptureError::Unsupported(format!(
            "microphone sample format {format} is unsupported"
        ))),
    }
}

fn build_typed_stream<T>(
    device: &cpal::Device,
    config: &StreamConfig,
    sender: Sender<Vec<f32>>,
    metrics: Arc<MicrophoneMetrics>,
    error: Arc<Mutex<Option<String>>>,
    start_gate: Arc<StartGate>,
) -> Result<Stream, CaptureError>
where
    T: SizedSample + Sample,
    f32: FromSample<T>,
{
    let callback_metrics = metrics.clone();
    let error_metrics = metrics;
    device
        .build_input_stream::<T, _, _>(
            *config,
            move |input, _| {
                if !start_gate.is_released() {
                    return;
                }
                let count = input.len() as u64;
                let samples = input.iter().copied().map(f32::from_sample).collect();
                match sender.try_send(samples) {
                    Ok(()) => {
                        callback_metrics
                            .samples_received
                            .fetch_add(count, Ordering::Relaxed);
                    }
                    Err(TrySendError::Full(_)) => {
                        callback_metrics
                            .samples_dropped
                            .fetch_add(count, Ordering::Relaxed);
                    }
                    Err(TrySendError::Disconnected(_)) => {
                        callback_metrics
                            .interruptions
                            .fetch_add(1, Ordering::Relaxed);
                    }
                }
            },
            move |stream_error| {
                error_metrics.interruptions.fetch_add(1, Ordering::Relaxed);
                if let Ok(mut slot) = error.lock() {
                    *slot = Some(format!("microphone stream failed: {stream_error}"));
                }
            },
            None,
        )
        .map_err(backend_error)
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("microphone capture failed: {error}"))
}
