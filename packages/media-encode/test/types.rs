#![allow(clippy::expect_used)]

use beam_media_encode::{AudioConfig, EncodeError, QueueLimits, VideoConfig};

#[test]
fn video_config_calculates_exact_rgba_size() {
    let config = VideoConfig {
        width: 1280,
        height: 720,
        fps: 30,
    };
    config.validate().expect("valid video format");
    assert_eq!(config.rgba_bytes().expect("size"), 1280 * 720 * 4);
}

#[test]
fn video_config_rejects_zero_dimensions_rate_and_overflow() {
    for config in [
        VideoConfig {
            width: 0,
            height: 720,
            fps: 30,
        },
        VideoConfig {
            width: 1280,
            height: 0,
            fps: 30,
        },
        VideoConfig {
            width: 1280,
            height: 720,
            fps: 0,
        },
        VideoConfig {
            width: u32::MAX,
            height: u32::MAX,
            fps: 30,
        },
    ] {
        assert!(matches!(
            config.validate(),
            Err(EncodeError::InvalidFormat(_))
        ));
    }
}

#[test]
fn audio_config_rejects_missing_rate_or_channels() {
    for config in [
        AudioConfig {
            sample_rate: 0,
            channels: 2,
        },
        AudioConfig {
            sample_rate: 48_000,
            channels: 0,
        },
    ] {
        assert!(matches!(
            config.validate(),
            Err(EncodeError::InvalidFormat(_))
        ));
    }
    AudioConfig {
        sample_rate: 48_000,
        channels: 2,
    }
    .validate()
    .expect("valid audio format");
}

#[test]
fn queue_limits_require_nonzero_packet_and_byte_budgets() {
    for limits in [
        QueueLimits {
            packets: 0,
            bytes: 4096,
        },
        QueueLimits {
            packets: 4,
            bytes: 0,
        },
    ] {
        assert!(matches!(
            limits.validate(),
            Err(EncodeError::InvalidFormat(_))
        ));
    }
    QueueLimits {
        packets: 4,
        bytes: 4096,
    }
    .validate()
    .expect("valid queue budget");
}
