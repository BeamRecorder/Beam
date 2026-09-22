#![cfg(test)]
#![allow(clippy::expect_used)]

use super::FirstFrame;
use crate::screen::{
    CursorSampleState, FrameTimestamp, OwnedScreenSample, OwnedVideoFrame, PixelFormat,
    ScreenSampleSink, TimestampSource,
};
use std::{
    sync::{Arc, mpsc},
    time::Duration,
};

#[test]
fn screenshot_sink_publishes_only_the_first_video_frame() {
    let (sender, receiver) = mpsc::sync_channel(1);
    let mut sink = FirstFrame(Some(sender));
    for byte in [7_u8, 9] {
        sink.push(OwnedScreenSample {
            frame: OwnedVideoFrame {
                width: 1,
                height: 1,
                stride: 4,
                pixel_format: PixelFormat::Bgra8,
                pixels: Arc::from([byte; 4]),
            },
            timestamp: FrameTimestamp {
                session_ns: 0,
                native_pts_ns: None,
                source: TimestampSource::MonotonicArrival,
            },
            sequence: 0,
            cursor: CursorSampleState::Unknown,
        })
        .expect("push frame");
    }
    assert_eq!(
        receiver
            .recv_timeout(Duration::from_millis(20))
            .expect("first frame")
            .pixels
            .as_ref(),
        &[7; 4]
    );
    assert!(receiver.try_recv().is_err());
}
