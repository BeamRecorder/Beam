use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

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

use crate::{
    CaptureError,
    backends::audio_common::{AudioCaptureMetrics, AudioPublisher, AudioSink},
    model::{
        MediaFormat, SourceCapabilities, SourceDescriptor, SourceId, SourceKind,
        SourceSelectionMode,
    },
    session::StartGate,
};

const SOURCE_ID: &str = "system-audio:sck:default";
const SAMPLE_RATE: u32 = 48_000;
const CHANNELS: u16 = 2;

pub struct ScreenCaptureAudioRecording {
    stream: Option<SCStream>,
    handler: usize,
    sink: Option<AudioSink>,
    metrics: Arc<AudioCaptureMetrics>,
    output: PathBuf,
}

pub fn discover_sources() -> Result<Vec<SourceDescriptor>, CaptureError> {
    Ok(vec![SourceDescriptor {
        id: SourceId::new(SOURCE_ID)?,
        kind: SourceKind::SystemAudio,
        label: "System audio".into(),
        is_default: true,
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
    }])
}

impl ScreenCaptureAudioRecording {
    pub fn start(
        source_id: &str,
        output: &Path,
        queue_capacity: usize,
        start_gate: Arc<StartGate>,
    ) -> Result<Self, CaptureError> {
        if source_id != SOURCE_ID {
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
            .with_sample_rate(SAMPLE_RATE)
            .with_channel_count(u32::from(CHANNELS));
        let (sink, publisher) = AudioSink::start(
            output,
            SAMPLE_RATE,
            CHANNELS,
            queue_capacity,
            "capture-sck-system-audio-writer",
        )?;
        let metrics = sink.metrics();
        let mut stream = SCStream::new(&filter, &configuration);
        let callback_gate = start_gate;
        let handler = stream
            .add_output_handler(
                move |sample: CMSampleBuffer, output_type| {
                    if output_type == SCStreamOutputType::Audio {
                        publish_sample(&sample, &callback_gate, &publisher);
                    }
                },
                SCStreamOutputType::Audio,
            )
            .ok_or_else(|| {
                CaptureError::Backend(
                    "ScreenCaptureKit rejected the system-audio output handler".into(),
                )
            })?;
        if let Err(error) = stream.start_capture() {
            let _ = stream.remove_output_handler(handler, SCStreamOutputType::Audio);
            drop(sink);
            let _ = std::fs::remove_file(output);
            return Err(backend_error(error));
        }
        Ok(Self {
            stream: Some(stream),
            handler,
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
        let stream_result = if let Some(mut stream) = self.stream.take() {
            let stop_result = stream.stop_capture().map_err(backend_error);
            let removed = stream.remove_output_handler(self.handler, SCStreamOutputType::Audio);
            if !removed && stop_result.is_ok() {
                Err(CaptureError::Backend(
                    "ScreenCaptureKit could not remove the system-audio handler".into(),
                ))
            } else {
                stop_result
            }
        } else {
            Ok(())
        };
        let sink_result = match self.sink.take() {
            Some(sink) => sink.stop(),
            None => Ok(()),
        };
        if let Err(error) = stream_result {
            let _ = std::fs::remove_file(&self.output);
            return Err(error);
        }
        sink_result
    }
}

impl Drop for ScreenCaptureAudioRecording {
    fn drop(&mut self) {
        if let Some(mut stream) = self.stream.take() {
            let _ = stream.stop_capture();
            let _ = stream.remove_output_handler(self.handler, SCStreamOutputType::Audio);
        }
        self.sink.take();
    }
}

fn publish_sample(sample: &CMSampleBuffer, gate: &StartGate, publisher: &AudioPublisher) {
    if !gate.is_released() || !sample.data_is_ready() {
        return;
    }
    let Some(list) = sample.audio_buffer_list() else {
        publisher.interruption();
        return;
    };
    let samples = interleaved_f32(&list);
    if !samples.is_empty() {
        publisher.publish(samples);
    }
}

fn interleaved_f32(list: &AudioBufferList) -> Vec<f32> {
    let buffers = list.iter().collect::<Vec<_>>();
    if buffers.is_empty() {
        return Vec::new();
    }
    if buffers.len() == 1 {
        return decode_f32(buffers[0].data());
    }
    let planar = buffers
        .iter()
        .map(|buffer| decode_f32(buffer.data()))
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

fn decode_f32(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(size_of::<f32>())
        .map(|sample| f32::from_ne_bytes([sample[0], sample[1], sample[2], sample[3]]))
        .collect()
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("ScreenCaptureKit system audio failed: {error}"))
}

#[cfg(test)]
mod tests {
    use super::decode_f32;

    #[test]
    fn decodes_native_f32_audio() {
        let bytes = [0.25f32.to_ne_bytes(), (-0.5f32).to_ne_bytes()].concat();
        assert_eq!(decode_f32(&bytes), vec![0.25, -0.5]);
    }

    #[test]
    fn ignores_incomplete_sample() {
        assert!(decode_f32(&[1, 2, 3]).is_empty());
    }
}
