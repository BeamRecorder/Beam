//! Cancellable, fair source decoding independent from the NLE playback actor.
mod audio;
pub mod bands;
pub mod reuse;
pub mod types;
mod video;
pub mod worker;
pub use worker::VisualWorker;

use crate::{EditorError, Result};
use types::{Source, VisualRequest};

/// Validates native source-time bounds and the maximum retained waveform size.
pub fn validate(source: &Source, request: &VisualRequest) -> Result<()> {
    match request {
        VisualRequest::Video { position_ms } => {
            if !source.asset.has_video || *position_ms >= source.asset.duration_ms {
                return Err(EditorError::Invalid(
                    "video preview is outside its source".into(),
                ));
            }
        }
        VisualRequest::Audio {
            start_ms,
            end_ms,
            step_ms,
        } => {
            if !source.asset.has_audio
                || *start_ms >= *end_ms
                || *end_ms > source.asset.duration_ms
                || end_ms - start_ms > 120_000
                || *step_ms == 0
                || *step_ms > 120_000
                || (end_ms - start_ms).div_ceil(*step_ms) > 2048
            {
                return Err(EditorError::Invalid(
                    "waveform needs a bounded source range and at most 2048 bins".into(),
                ));
            }
        }
    }
    Ok(())
}
