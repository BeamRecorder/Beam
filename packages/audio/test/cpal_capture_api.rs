use std::sync::Arc;

use beam_audio::{AudioQueueLimits, open_microphone};
use beam_media_core::{SessionClock, StartGate};

#[test]
fn malformed_device_id_fails_before_hardware_is_opened() {
    let result = open_microphone(
        Some("missing-host-prefix"),
        SessionClock::start(),
        Arc::new(StartGate::new()),
        AudioQueueLimits::default(),
    );
    assert!(result.is_err());
}
