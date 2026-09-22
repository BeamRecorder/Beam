#![allow(clippy::expect_used)]

use std::sync::Arc;

use capture::screen::{FrameTimestamp, OwnedVideoFrame, PixelFormat, TimestampSource};

#[test]
fn owned_screen_frame_and_native_timestamp_survive_cloning() {
    let frame = OwnedVideoFrame {
        width: 2,
        height: 1,
        stride: 8,
        pixel_format: PixelFormat::Bgra8,
        pixels: Arc::from([0_u8; 8]),
    };
    let clone = frame.clone();
    assert!(Arc::ptr_eq(&frame.pixels, &clone.pixels));
    let timestamp = FrameTimestamp {
        session_ns: 100,
        native_pts_ns: Some(500),
        source: TimestampSource::NativePresentation,
    };
    let json = serde_json::to_value(timestamp).expect("timestamp JSON");
    assert_eq!(json["nativePtsNs"], 500);
    assert_eq!(json["source"], "native-presentation");
}
