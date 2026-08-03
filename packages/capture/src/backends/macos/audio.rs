use crate::{CaptureError, model::SourceDescriptor};

pub use crate::backends::audio_common::{AudioCaptureMetrics, MicrophoneRecording};

pub fn discover_sources() -> Result<Vec<SourceDescriptor>, CaptureError> {
    let mut sources = crate::backends::audio_common::discover_microphones()?;
    if let Ok(system_sources) = super::system_audio::discover_sources() {
        sources.extend(system_sources);
    }
    Ok(sources)
}
