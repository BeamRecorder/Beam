use std::time::Duration;

use super::ScreenCaptureMetrics;
use crate::model::{VideoEncoderAttempt, VideoEncoderFinalization, VideoEncodingDiagnostics};

pub(crate) const WINDOWS_ENCODER_FINALIZATION_TIMEOUT: Duration = Duration::from_secs(60);
// Includes stopping WGC before draining the encoder and releasing native resources.
pub(crate) const WINDOWS_STOP_TIMEOUT: Duration = Duration::from_secs(70);

fn milliseconds(duration: Duration) -> u64 {
    u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
}

pub(crate) fn begin(
    metrics: &ScreenCaptureMetrics,
    (width, height): (u32, u32),
    bitrate_bps: u32,
    fps: u32,
    queue_capacity: usize,
) {
    metrics.update_encoding(|state| {
        *state = Some(VideoEncodingDiagnostics {
            backend: "windows-media-transcoder".into(),
            codec: "h264".into(),
            requested_mode: None,
            width,
            height,
            fps,
            bitrate_bps,
            queue_capacity,
            initialization_ms: None,
            initialization_error: None,
            attempts: Vec::new(),
            finalization: None,
        });
    });
}

pub(crate) fn attempt(
    metrics: &ScreenCaptureMetrics,
    mode: &str,
    elapsed: Duration,
    error: Option<&str>,
) {
    metrics.update_encoding(|state| {
        if let Some(state) = state {
            if error.is_none() {
                state.requested_mode = Some(mode.into());
            }
            state.attempts.push(VideoEncoderAttempt {
                requested_mode: mode.into(),
                elapsed_ms: milliseconds(elapsed),
                error: error.map(str::to_owned),
            });
        }
    });
}

pub(crate) fn initialized(metrics: &ScreenCaptureMetrics, elapsed: Duration, error: Option<&str>) {
    metrics.update_encoding(|state| {
        if let Some(state) = state {
            state.initialization_ms = Some(milliseconds(elapsed));
            state.initialization_error = error.map(str::to_owned);
        }
    });
}

pub(crate) fn finalized(metrics: &ScreenCaptureMetrics, elapsed: Duration, error: Option<&str>) {
    metrics.update_encoding(|state| {
        if let Some(state) = state {
            state.finalization = Some(VideoEncoderFinalization {
                elapsed_ms: milliseconds(elapsed),
                timeout_ms: milliseconds(WINDOWS_ENCODER_FINALIZATION_TIMEOUT),
                success: error.is_none(),
                error: error.map(str::to_owned),
            });
        }
    });
}

#[cfg(test)]
#[path = "encoding_diagnostics_tests.rs"]
mod tests;
