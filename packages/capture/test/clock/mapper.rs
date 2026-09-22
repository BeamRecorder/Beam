#![allow(clippy::expect_used)]

use capture::clock::{LinearTimestampMapper, TimestampMapper};

#[test]
fn independent_native_clocks_keep_distinct_session_anchors() {
    let mut camera = LinearTimestampMapper::new(1_000, 5_000, 1_000).expect("camera mapper");
    let mut audio = LinearTimestampMapper::new(48_000, 7_000, 48_000).expect("audio mapper");
    assert_eq!(
        camera.to_session_ns(2_000).expect("camera second"),
        1_000_005_000
    );
    assert_eq!(
        audio.to_session_ns(96_000).expect("audio second"),
        1_000_007_000
    );
    assert_eq!(
        camera.to_session_ns(2_001).expect("camera monotonic"),
        1_001_005_000
    );
}
