#![cfg(target_os = "macos")]
#![allow(clippy::expect_used)]

use std::{sync::Arc, time::Duration};

use beam_audio::{AudioQueueLimits, list_system_outputs, open_system_audio};
use beam_media_core::{MonotonicClock, SessionClock, StartGate};

#[test]
#[ignore = "set BEAM_TEST_DUPLEX_OUTPUT_ID to a duplex output's discovered ID on macOS 14.2+"]
fn duplex_output_is_captured_as_system_audio() {
    let selected = std::env::var("BEAM_TEST_DUPLEX_OUTPUT_ID")
        .expect("a duplex output ID from beam-media-probe devices");
    assert!(
        list_system_outputs()
            .expect("system outputs")
            .iter()
            .any(|output| output.id == selected)
    );
    let clock = SessionClock::start();
    let gate = Arc::new(StartGate::new());
    let capture = open_system_audio(
        Some(&selected),
        clock.clone(),
        gate.clone(),
        AudioQueueLimits::default(),
    )
    .expect("Core Audio output tap");
    gate.release(clock.now_ns()).expect("release start gate");
    let packet = capture
        .recv_packet_timeout(Duration::from_secs(5))
        .expect("read output samples")
        .expect("system output packet");
    assert!(packet.packet.frames > 0);
    gate.close();
    capture.stop().expect("stop output tap and aggregate");
}
