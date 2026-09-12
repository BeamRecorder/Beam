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

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;
    use crate::screen::linux::FfmpegEncoder;

    fn unavailable(_: PathBuf) -> Result<FfmpegCapabilities, CaptureError> {
        Err(CaptureError::native(
            NativeCaptureErrorCode::FfmpegEncoderUnavailable,
            "no working encoder",
        ))
    }

    fn available(executable: PathBuf) -> Result<FfmpegCapabilities, CaptureError> {
        Ok(FfmpegCapabilities {
            executable,
            encoder: FfmpegEncoder::software("libx264"),
        })
    }

    #[test]
    fn shares_failures_with_immediate_discovery_and_retries_after_expiry() {
        let mut cache = FfmpegProbeCache::default();
        let now = Instant::now();
        let path = PathBuf::from("ffmpeg");
        let first = cache
            .get_or_probe(path.clone(), || now, unavailable)
            .expect_err("first failure");
        let second = cache
            .get_or_probe(path.clone(), || now, available)
            .expect_err("cached failure");
        assert_eq!(first.to_string(), second.to_string());
        cache
            .get_or_probe(path.clone(), || now + FAILURE_RETRY_DELAY, available)
            .expect("retry succeeds");
        cache
            .get_or_probe(path, || now + Duration::from_secs(60), unavailable)
            .expect("successful result stays cached");
    }

    #[test]
    fn measures_retry_delay_from_completion_of_a_slow_probe() {
        let mut cache = FfmpegProbeCache::default();
        let now = std::cell::Cell::new(Instant::now());
        let path = PathBuf::from("ffmpeg");
        let _ = cache.get_or_probe(
            path.clone(),
            || now.get(),
            |path| {
                now.set(now.get() + Duration::from_secs(10));
                unavailable(path)
            },
        );
        assert!(cache.get_or_probe(path, || now.get(), available).is_err());
    }

    #[test]
    fn a_different_executable_does_not_inherit_a_cached_failure() {
        let mut cache = FfmpegProbeCache::default();
        let _ = cache.get_or_probe("missing".into(), Instant::now, unavailable);
        cache
            .get_or_probe("ffmpeg".into(), Instant::now, available)
            .expect("replacement executable");
    }
}
