use crate::{CaptureError, model::SourceDescriptor};

pub use crate::backends::audio_common::{AudioCaptureMetrics, MicrophoneRecording};

pub fn discover_sources() -> Result<Vec<SourceDescriptor>, CaptureError> {
    let mut sources = crate::backends::audio_common::discover_microphones()?;
    sources.extend(super::system_audio::discover_sources()?);
    Ok(sources)
}
