use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

use super::ffmpeg::FfmpegCapabilities;
use crate::{CaptureError, NativeCaptureErrorCode};

const FAILURE_RETRY_DELAY: Duration = Duration::from_secs(2);

struct ProbeFailure {
    executable: PathBuf,
    completed: Instant,
    code: NativeCaptureErrorCode,
    message: String,
}

#[derive(Default)]
pub(super) struct FfmpegProbeCache {
    capabilities: Option<FfmpegCapabilities>,
    failure: Option<ProbeFailure>,
}

impl FfmpegProbeCache {
    pub(super) fn get_or_probe(
        &mut self,
        executable: PathBuf,
        now: impl Fn() -> Instant,
        probe: impl FnOnce(PathBuf) -> Result<FfmpegCapabilities, CaptureError>,
    ) -> Result<FfmpegCapabilities, CaptureError> {
        if let Some(capabilities) = &self.capabilities {
            return Ok(capabilities.clone());
        }
        if let Some(failure) = &self.failure
            && failure.executable == executable
            && now().saturating_duration_since(failure.completed) < FAILURE_RETRY_DELAY
        {
            return Err(CaptureError::native(failure.code, failure.message.clone()));
        }
        self.failure = None;
        let result = probe(executable.clone());
        match &result {
            Ok(capabilities) => self.capabilities = Some(capabilities.clone()),
            Err(CaptureError::Native { code, message }) => {
                // Do not repeat a failed hardware sweep when HUD discovery
                // immediately follows warmup. Later refreshes can recover.
                self.failure = Some(ProbeFailure {
                    executable,
                    completed: now(),
                    code: *code,
                    message: message.clone(),
                });
            }
            Err(_) => {}
        }
        result
    }
}

#[path = "../../../test/screen/linux/ffmpeg_cache.rs"]
mod ffmpeg_cache_checks;
