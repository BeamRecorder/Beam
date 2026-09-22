#![cfg(target_os = "linux")]
#![allow(clippy::expect_used)]

use std::sync::Arc;

use beam_audio::{AudioError, AudioQueueLimits, open_system_audio};
use beam_media_core::{SessionClock, StartGate};

#[test]
fn invalid_pipewire_output_and_queue_limits_fail_before_stream_creation() {
    let clock = SessionClock::start();
    let gate = Arc::new(StartGate::new());
    let wrong = open_system_audio(
        Some("pipewire:no-such-output"),
        clock.clone(),
        gate.clone(),
        AudioQueueLimits::default(),
    );
    assert!(matches!(wrong, Err(AudioError::DeviceUnavailable(_))));
    let limits = AudioQueueLimits {
        packets: 0,
        bytes: 4096,
    };
    assert!(matches!(
        open_system_audio(None, clock, gate, limits),
        Err(AudioError::Unsupported(_))
    ));
}

#[test]
fn zero_byte_budget_and_explicit_default_fail_before_pipewire_connection() {
    let limits = AudioQueueLimits {
        packets: 1,
        bytes: 0,
    };
    let result = open_system_audio(
        Some("pipewire:default-output"),
        SessionClock::start(),
        Arc::new(StartGate::new()),
        limits,
    );
    assert!(matches!(
        result,
        Err(AudioError::Unsupported(reason)) if reason.contains("non-zero")
    ));
}
