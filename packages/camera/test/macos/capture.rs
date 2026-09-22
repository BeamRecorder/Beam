#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;
use crate::PixelFormat;

#[test]
fn macos_halt_preserves_queued_owned_frames() {
    let (sender, frames) = crossbeam_channel::bounded(1);
    let format = CameraFormat {
        width: 1,
        height: 1,
        fps: 30,
        pixel_format: PixelFormat::Bgra,
        stride: 4,
    };
    sender
        .send(VideoFrame {
            captured_ns: 1,
            width: 1,
            height: 1,
            data: CameraFrame {
                format,
                native_timestamp_ns: Some(10),
                sequence: 1,
                data: Arc::from([0_u8; 4]),
            },
        })
        .expect("frame");
    let (events, _, _) = CameraEventQueue::new();
    let mut capture = CameraCapture {
        frames,
        events,
        latest: Arc::new(LatestFrame::new()),
        queued_bytes: Arc::new(AtomicUsize::new(4)),
        stop: Arc::new(AtomicBool::new(false)),
        worker: None,
        format,
    };
    capture.halt().expect("halt");
    assert_eq!(capture.queue_depth(), (1, 4));
    assert_eq!(
        capture
            .try_frame()
            .expect("queue")
            .expect("frame")
            .captured_ns,
        1
    );
    assert_eq!(capture.queue_depth(), (0, 0));
}
