use std::{
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
        mpsc::{SyncSender, TrySendError, sync_channel},
    },
    thread::JoinHandle,
};

use screencapturekit::{
    cm::{CMSampleBuffer, CMSampleBufferExt},
    shareable_content::SCShareableContent,
    stream::{SCStream, configuration::SCStreamConfiguration, output_type::SCStreamOutputType},
};

use crate::{CaptureError, audio::WavSegmentWriter, model::SourceId, session::StartGate};

#[derive(Debug, Default)]
pub struct MacSystemAudioMetrics {
    samples_received: AtomicU64,
    samples_dropped: AtomicU64,
    interruptions: AtomicU64,
}

impl MacSystemAudioMetrics {
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

pub struct MacSystemAudioRecording {
    stream: Option<SCStream>,
    handler_id: usize,
    sender: Option<SyncSender<Vec<f32>>>,
    writer: Option<JoinHandle<Result<u64, CaptureError>>>,
    metrics: Arc<MacSystemAudioMetrics>,
}

impl MacSystemAudioRecording {
    pub fn start(
        source_id: &SourceId,
        output: &Path,
        queue_capacity: usize,
        start_gate: Arc<StartGate>,
    ) -> Result<Self, CaptureError> {
        if queue_capacity == 0 {
            return Err(CaptureError::InvalidConfiguration(
                "system audio queue capacity must be non-zero".into(),
            ));
        }
        let content = SCShareableContent::get().map_err(backend_error)?;
        let (filter, _, _) = crate::screen::mac::resolve_filter(&content, source_id)?;
        let configuration = SCStreamConfiguration::new()
            .with_captures_audio(true)
            .with_sample_rate(48_000)
            .with_channel_count(2)
            .with_excludes_current_process_audio(true);
        let (sender, receiver) = sync_channel::<Vec<f32>>(queue_capacity);
        let (writer_ready_sender, writer_ready_receiver) = sync_channel(1);
        let writer_path = output.to_owned();
        let writer = std::thread::Builder::new()
            .name("capture-macos-system-audio-writer".into())
            .spawn(move || {
                let mut writer = match WavSegmentWriter::create(&writer_path, 48_000, 2) {
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
                let samples = writer.samples_written();
                writer.finalize()?;
                Ok(samples)
            })
            .map_err(backend_error)?;
        if let Err(message) = writer_ready_receiver.recv().map_err(|_| {
            CaptureError::Backend("macOS audio writer startup channel closed".into())
        })? {
            drop(sender);
            let _joined = writer.join();
            return Err(CaptureError::Backend(message));
        }
        let metrics = Arc::new(MacSystemAudioMetrics::default());
        let callback_metrics = metrics.clone();
        let callback_sender = sender.clone();
        let callback_gate = start_gate;
        let mut stream = SCStream::new(&filter, &configuration);
        let handler_id = stream
            .add_output_handler(
                move |sample: CMSampleBuffer, _| {
                    if !callback_gate.is_released() {
                        return;
                    }
                    deliver_audio(&sample, &callback_sender, &callback_metrics);
                },
                SCStreamOutputType::Audio,
            )
            .ok_or_else(|| {
                CaptureError::Backend("ScreenCaptureKit rejected the audio output".into())
            })?;
        stream.start_capture().map_err(backend_error)?;
        Ok(Self {
            stream: Some(stream),
            handler_id,
            sender: Some(sender),
            writer: Some(writer),
            metrics,
        })
    }

    pub fn stop(mut self) -> Result<u64, CaptureError> {
        self.finish()
    }

    #[must_use]
    pub fn metrics(&self) -> Arc<MacSystemAudioMetrics> {
        self.metrics.clone()
    }

    fn finish(&mut self) -> Result<u64, CaptureError> {
        if let Some(mut stream) = self.stream.take() {
            stream.stop_capture().map_err(backend_error)?;
            let _removed = stream.remove_output_handler(self.handler_id, SCStreamOutputType::Audio);
        }
        self.sender.take();
        if let Some(writer) = self.writer.take() {
            return writer
                .join()
                .map_err(|_| CaptureError::Backend("macOS audio writer thread panicked".into()))?;
        }
        Ok(self.metrics.samples_received())
    }
}

impl Drop for MacSystemAudioRecording {
    fn drop(&mut self) {
        let _result = self.finish();
    }
}

fn deliver_audio(
    sample: &CMSampleBuffer,
    sender: &SyncSender<Vec<f32>>,
    metrics: &MacSystemAudioMetrics,
) {
    let Some(buffers) = sample.audio_buffer_list() else {
        metrics.interruptions.fetch_add(1, Ordering::Relaxed);
        return;
    };
    let channels = buffers
        .iter()
        .map(|buffer| bytes_to_f32(buffer.data()))
        .collect::<Vec<_>>();
    let samples = if channels.len() <= 1 {
        channels.into_iter().next().unwrap_or_default()
    } else {
        interleave(&channels)
    };
    let count = samples.len() as u64;
    match sender.try_send(samples) {
        Ok(()) => {
            metrics.samples_received.fetch_add(count, Ordering::Relaxed);
        }
        Err(TrySendError::Full(_)) => {
            metrics.samples_dropped.fetch_add(count, Ordering::Relaxed);
        }
        Err(TrySendError::Disconnected(_)) => {
            metrics.interruptions.fetch_add(1, Ordering::Relaxed);
        }
    }
}

fn bytes_to_f32(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|bytes| f32::from_ne_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
        .collect()
}

fn interleave(channels: &[Vec<f32>]) -> Vec<f32> {
    let frames = channels.iter().map(Vec::len).min().unwrap_or(0);
    let mut output = Vec::with_capacity(frames.saturating_mul(channels.len()));
    for frame in 0..frames {
        for channel in channels {
            output.push(channel[frame]);
        }
    }
    output
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("ScreenCaptureKit audio capture failed: {error}"))
}
