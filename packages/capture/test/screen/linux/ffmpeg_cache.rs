#![cfg(test)]
#![allow(clippy::expect_used)]

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
