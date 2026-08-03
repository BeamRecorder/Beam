use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    sync::Arc,
    thread::{self, JoinHandle},
};

use crossbeam_channel::{Receiver, Sender, TryRecvError, bounded};
use wasapi::{
    DeviceEnumerator, Direction, SampleType, StreamMode, WasapiError, WaveFormat, deinitialize,
    initialize_mta,
};

use crate::{
    CaptureError,
    backends::audio_common::{AudioCaptureMetrics, AudioPublisher, AudioSink},
    model::{
        MediaFormat, SourceCapabilities, SourceDescriptor, SourceId, SourceKind,
        SourceSelectionMode,
    },
    session::StartGate,
};

const SOURCE_PREFIX: &str = "system-audio:wasapi:";
const SAMPLE_RATE: u32 = 48_000;
const CHANNELS: u16 = 2;
const READ_TIMEOUT_MS: u32 = 250;

pub struct WasapiLoopbackRecording {
    stop: Option<Sender<()>>,
    capture: Option<JoinHandle<Result<(), CaptureError>>>,
    sink: Option<AudioSink>,
    metrics: Arc<AudioCaptureMetrics>,
    output: PathBuf,
}

pub fn discover_sources() -> Result<Vec<SourceDescriptor>, CaptureError> {
    let _com = ComApartment::initialize()?;
    let enumerator = DeviceEnumerator::new().map_err(backend_error)?;
    let default_id = enumerator
        .get_default_device(&Direction::Render)
        .and_then(|device| device.get_id())
        .ok();
    let collection = enumerator
        .get_device_collection(&Direction::Render)
        .map_err(backend_error)?;
    let count = collection.get_nbr_devices().map_err(backend_error)?;
    let mut sources = Vec::with_capacity(usize::try_from(count).unwrap_or_default());
    for index in 0..count {
        let device = collection
            .get_device_at_index(index)
            .map_err(backend_error)?;
        let endpoint_id = device.get_id().map_err(backend_error)?;
        let label = device.get_friendlyname().map_err(backend_error)?;
        sources.push(SourceDescriptor {
            id: SourceId::new(format!("{SOURCE_PREFIX}{endpoint_id}"))?,
            kind: SourceKind::SystemAudio,
            label,
            is_default: default_id.as_deref() == Some(endpoint_id.as_str()),
            selection_mode: SourceSelectionMode::Direct,
            display_id: None,
            capabilities: SourceCapabilities {
                formats: vec![MediaFormat::Audio {
                    sample_rate: SAMPLE_RATE,
                    channels: CHANNELS,
                    sample_format: "f32".into(),
                }],
                ..SourceCapabilities::default()
            },
        });
    }
    Ok(sources)
}

impl WasapiLoopbackRecording {
    pub fn start(
        source_id: &str,
        output: &Path,
        queue_capacity: usize,
        start_gate: Arc<StartGate>,
    ) -> Result<Self, CaptureError> {
        let endpoint_id = source_id
            .strip_prefix(SOURCE_PREFIX)
            .ok_or_else(|| {
                CaptureError::InvalidConfiguration(format!(
                    "{source_id} is not a WASAPI loopback source"
                ))
            })?
            .to_owned();
        let (sink, publisher) = AudioSink::start(
            output,
            SAMPLE_RATE,
            CHANNELS,
            queue_capacity,
            "capture-wasapi-loopback-writer",
        )?;
        let metrics = sink.metrics();
        let (stop_sender, stop_receiver) = bounded(1);
        let capture = match thread::Builder::new()
            .name("capture-wasapi-loopback".into())
            .spawn(move || {
                capture_loop(
                    &endpoint_id,
                    publisher,
                    stop_receiver,
                    start_gate,
                )
            })
        {
            Ok(capture) => capture,
            Err(error) => {
                drop(sink);
                let _ = std::fs::remove_file(output);
                return Err(CaptureError::Backend(error.to_string()));
            }
        };
        Ok(Self {
            stop: Some(stop_sender),
            capture: Some(capture),
            sink: Some(sink),
            metrics,
            output: output.to_owned(),
        })
    }

    pub fn stop(mut self) -> Result<(), CaptureError> {
        self.finish()
    }

    #[must_use]
    pub fn metrics(&self) -> Arc<AudioCaptureMetrics> {
        self.metrics.clone()
    }

    fn finish(&mut self) -> Result<(), CaptureError> {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        let capture_result = match self.capture.take() {
            Some(capture) => capture
                .join()
                .map_err(|_| CaptureError::Backend("WASAPI loopback thread panicked".into()))?,
            None => Ok(()),
        };
        let sink_result = match self.sink.take() {
            Some(sink) => sink.stop(),
            None => Ok(()),
        };
        if let Err(error) = capture_result {
            let _ = std::fs::remove_file(&self.output);
            return Err(error);
        }
        sink_result
    }
}

impl Drop for WasapiLoopbackRecording {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        if let Some(capture) = self.capture.take() {
            let _ = capture.join();
        }
        self.sink.take();
    }
}

fn capture_loop(
    endpoint_id: &str,
    publisher: AudioPublisher,
    stop: Receiver<()>,
    start_gate: Arc<StartGate>,
) -> Result<(), CaptureError> {
    let _com = ComApartment::initialize()?;
    let enumerator = DeviceEnumerator::new().map_err(backend_error)?;
    let device = enumerator.get_device(endpoint_id).map_err(backend_error)?;
    let mut client = device.get_iaudioclient().map_err(backend_error)?;
    let format = WaveFormat::new(
        32,
        32,
        &SampleType::Float,
        usize::try_from(SAMPLE_RATE).unwrap_or(48_000),
        usize::from(CHANNELS),
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
    let _ = start_gate.wait()?;
    client.start_stream().map_err(backend_error)?;
    let mut bytes = VecDeque::new();

    let capture_result = loop {
        match stop.try_recv() {
            Ok(()) | Err(TryRecvError::Disconnected) => break Ok(()),
            Err(TryRecvError::Empty) => {}
        }
        match event.wait_for_event(READ_TIMEOUT_MS) {
            Ok(()) => {}
            Err(WasapiError::EventTimeout) => continue,
            Err(error) => break Err(backend_error(error)),
        }
        loop {
            let packet_size = capture.get_next_packet_size().map_err(backend_error)?;
            if !packet_size.is_some_and(|frames| frames > 0) {
                break;
            }
            let info = capture
                .read_from_device_to_deque(&mut bytes)
                .map_err(backend_error)?;
            if info.flags.data_discontinuity || info.flags.timestamp_error {
                publisher.interruption();
            }
            let samples = drain_f32(&mut bytes);
            if !samples.is_empty() {
                publisher.publish(samples);
            }
        }
    };
    let stop_result = client.stop_stream().map_err(backend_error);
    capture_result.and(stop_result)
}

fn drain_f32(bytes: &mut VecDeque<u8>) -> Vec<f32> {
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

struct ComApartment;

impl ComApartment {
    fn initialize() -> Result<Self, CaptureError> {
        initialize_mta()
            .ok()
            .map_err(|error| CaptureError::Backend(format!("WASAPI COM init failed: {error}")))?;
        Ok(Self)
    }
}

impl Drop for ComApartment {
    fn drop(&mut self) {
        deinitialize();
    }
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("WASAPI loopback failed: {error}"))
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;

    use super::drain_f32;

    #[test]
    fn drains_complete_little_endian_f32_samples() {
        let mut bytes = VecDeque::from([0.25f32.to_le_bytes(), (-0.5f32).to_le_bytes()].concat());
        assert_eq!(drain_f32(&mut bytes), vec![0.25, -0.5]);
        assert!(bytes.is_empty());
    }

    #[test]
    fn retains_incomplete_tail() {
        let mut bytes = VecDeque::from(vec![0, 0, 0, 0, 7]);
        assert_eq!(drain_f32(&mut bytes), vec![0.0]);
        assert_eq!(bytes, VecDeque::from(vec![7]));
    }
}
