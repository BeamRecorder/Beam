use std::{
    mem::size_of,
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc,
    },
    thread::JoinHandle,
    time::Duration,
};

use wasapi::{DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat, initialize_mta};

use crate::{CaptureError, audio::WavSegmentWriter, model::SourceId, session::StartGate};

#[derive(Debug, Default)]
pub struct SystemAudioMetrics {
    samples_received: AtomicU64,
    interruptions: AtomicU64,
}

impl SystemAudioMetrics {
    #[must_use]
    pub fn samples_received(&self) -> u64 {
        self.samples_received.load(Ordering::Relaxed)
    }
    #[must_use]
    pub fn interruptions(&self) -> u64 {
        self.interruptions.load(Ordering::Relaxed)
    }
}

pub struct WasapiLoopbackRecording {
    cancel: Arc<AtomicBool>,
    thread: Option<JoinHandle<Result<u64, CaptureError>>>,
    metrics: Arc<SystemAudioMetrics>,
    sample_rate: u32,
    channels: u16,
}

impl WasapiLoopbackRecording {
    pub fn start(
        source_id: Option<&SourceId>,
        output: &Path,
        start_gate: Arc<StartGate>,
    ) -> Result<Self, CaptureError> {
        let selected = source_id.map(ToString::to_string);
        let output = output.to_owned();
        let cancel = Arc::new(AtomicBool::new(false));
        let thread_cancel = cancel.clone();
        let metrics = Arc::new(SystemAudioMetrics::default());
        let thread_metrics = metrics.clone();
        let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
        let thread = std::thread::Builder::new()
            .name("capture-wasapi-loopback".into())
            .spawn(move || {
                capture_loop(
                    selected.as_deref(),
                    &output,
                    &thread_cancel,
                    &thread_metrics,
                    &ready_sender,
                    &start_gate,
                )
            })
            .map_err(backend_error)?;
        let (sample_rate, channels) = ready_receiver
            .recv()
            .map_err(|_| CaptureError::Backend("WASAPI startup channel closed".into()))??;
        Ok(Self {
            cancel,
            thread: Some(thread),
            metrics,
            sample_rate,
            channels,
        })
    }

    pub fn stop(mut self) -> Result<u64, CaptureError> {
        self.finish()
    }
    #[must_use]
    pub fn metrics(&self) -> Arc<SystemAudioMetrics> {
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
        self.cancel.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            return thread
                .join()
                .map_err(|_| CaptureError::Backend("WASAPI capture thread panicked".into()))?;
        }
        Ok(self.metrics.samples_received())
    }
}

impl Drop for WasapiLoopbackRecording {
    fn drop(&mut self) {
        let _result = self.finish();
    }
}

fn capture_loop(
    selected: Option<&str>,
    output: &Path,
    cancel: &AtomicBool,
    metrics: &SystemAudioMetrics,
    ready: &mpsc::SyncSender<Result<(u32, u16), CaptureError>>,
    start_gate: &Arc<StartGate>,
) -> Result<u64, CaptureError> {
    let initialized = initialize_loopback(selected);
    let (client, format) = match initialized {
        Ok(value) => value,
        Err(error) => {
            let _sent = ready.send(Err(CaptureError::Backend(error.to_string())));
            return Err(error);
        }
    };
    let sample_rate = format.get_samplespersec();
    let channels = format.get_nchannels();
    let capture = client.get_audiocaptureclient().map_err(backend_error)?;
    let mut writer = WavSegmentWriter::create(output, sample_rate, channels)?;
    ready
        .send(Ok((sample_rate, channels)))
        .map_err(|_| CaptureError::Backend("WASAPI startup receiver closed".into()))?;
    start_gate.wait()?;
    client.start_stream().map_err(backend_error)?;
    while !cancel.load(Ordering::Acquire) {
        let packet_frames = capture
            .get_next_packet_size()
            .map_err(backend_error)?
            .unwrap_or(0);
        if packet_frames == 0 {
            std::thread::sleep(Duration::from_millis(3));
            continue;
        }
        let byte_count = usize::try_from(packet_frames)
            .unwrap_or(usize::MAX)
            .saturating_mul(usize::from(channels))
            .saturating_mul(size_of::<f32>());
        let mut bytes = vec![0_u8; byte_count];
        let (frames, info) = capture.read_from_device(&mut bytes).map_err(|error| {
            metrics.interruptions.fetch_add(1, Ordering::Relaxed);
            backend_error(error)
        })?;
        let samples = decode_packet(&bytes, frames, channels, info.flags.silent);
        writer.write(&samples)?;
        metrics
            .samples_received
            .fetch_add(samples.len() as u64, Ordering::Relaxed);
    }
    client.stop_stream().map_err(backend_error)?;
    let samples = writer.samples_written();
    writer.finalize()?;
    Ok(samples)
}

fn decode_packet(bytes: &[u8], frames: u32, channels: u16, silent: bool) -> Vec<f32> {
    let samples = usize::try_from(frames)
        .unwrap_or(usize::MAX)
        .saturating_mul(usize::from(channels));
    if silent {
        return vec![0.0; samples];
    }
    bytes
        .chunks_exact(size_of::<f32>())
        .take(samples)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::decode_packet;

    #[test]
    fn decodes_interleaved_f32_packet() {
        let bytes = [0.0_f32.to_le_bytes(), 0.5_f32.to_le_bytes()].concat();
        assert_eq!(decode_packet(&bytes, 1, 2, false), vec![0.0, 0.5]);
    }

    #[test]
    fn silent_packet_does_not_read_the_native_buffer() {
        assert_eq!(decode_packet(&[], 2, 2, true), vec![0.0; 4]);
    }

    #[test]
    fn ignores_trailing_incomplete_bytes() {
        assert_eq!(decode_packet(&[0, 0, 0], 1, 1, false), Vec::<f32>::new());
    }
}

fn initialize_loopback(
    selected: Option<&str>,
) -> Result<(wasapi::AudioClient, WaveFormat), CaptureError> {
    initialize_mta().ok().map_err(backend_error)?;
    let enumerator = DeviceEnumerator::new().map_err(backend_error)?;
    let device = if let Some(id) = selected {
        let native_id = id.strip_prefix("wasapi:output:").ok_or_else(|| {
            CaptureError::InvalidConfiguration(format!("invalid output ID: {id}"))
        })?;
        let collection = enumerator
            .get_device_collection(&Direction::Render)
            .map_err(backend_error)?;
        (&collection)
            .into_iter()
            .filter_map(Result::ok)
            .find(|device| device.get_id().ok().as_deref() == Some(native_id))
            .ok_or_else(|| CaptureError::SourceNotFound(id.to_owned()))?
    } else {
        enumerator
            .get_default_device(&Direction::Render)
            .map_err(backend_error)?
    };
    let mut client = device.get_iaudioclient().map_err(backend_error)?;
    let mix = client.get_mixformat().map_err(backend_error)?;
    let format = WaveFormat::new(
        32,
        32,
        &SampleType::Float,
        mix.get_samplespersec() as usize,
        mix.get_nchannels() as usize,
        None,
    );
    let (_, minimum_period) = client.get_device_period().map_err(backend_error)?;
    client
        .initialize_client(
            &format,
            &Direction::Capture,
            &StreamMode::PollingShared {
                autoconvert: true,
                buffer_duration_hns: minimum_period,
            },
        )
        .map_err(backend_error)?;
    Ok((client, format))
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("WASAPI loopback capture failed: {error}"))
}
