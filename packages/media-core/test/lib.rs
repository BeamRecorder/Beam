#![allow(clippy::expect_used)]

use beam_media_core::{LatestFrame, MonotonicClock, SessionClock, StartGate, VideoFrame};

#[test]
fn public_session_contract_rebases_and_delivers_the_latest_frame() {
    let clock = SessionClock::start();
    let gate = StartGate::new();
    let release_ns = clock.now_ns();
    gate.release(release_ns).expect("release once");

    let preview = LatestFrame::new();
    let first = VideoFrame {
        captured_ns: gate.session_ns(release_ns).expect("at release"),
        width: 2,
        height: 2,
        data: vec![0_u8; 16],
    };
    let second = VideoFrame {
        captured_ns: gate.session_ns(release_ns + 1).expect("after release"),
        width: 2,
        height: 2,
        data: vec![1_u8; 16],
    };
    assert!(preview.publish(first).is_none());
    let displaced = preview.publish(second).expect("first was displaced");
    assert_eq!(displaced.captured_ns, 0);
    assert_eq!(preview.take().expect("latest frame").captured_ns, 1);
}
