#![cfg(test)]
#![allow(clippy::unwrap_used)]
use super::*;
#[test]
fn detached_source_retains_bounded_preview_errors_identity_and_idempotent_halt() {
    let queue = SampleQueue::new(ScreenQueueLimits::default()).unwrap();
    let mut source = ScreenCapture {
        recording: None,
        queue: queue.clone(),
        format: VideoFormat {
            width: 2,
            height: 2,
            stride: 8,
            pixel_format: crate::screen::PixelFormat::Bgra8,
        },
        source_id: "screen".into(),
    };
    assert_eq!(source.format().width, 2);
    assert_eq!(source.source_id(), "screen");
    assert_eq!(source.queue_depth(), (0, 0));
    assert!(source.try_frame().unwrap().is_none());
    assert!(source.preview_handle().take().is_none());
    queue.dropped.store(2, Ordering::Relaxed);
    assert_eq!(source.dropped_frames(), 2);
    queue
        .cursors
        .lock()
        .unwrap()
        .push_back((7, crate::screen::CursorSampleState::Unknown));
    assert_eq!(source.try_cursor().unwrap().0, 7);
    assert!(source.try_cursor().is_none());
    queue.fail("producer failed".into());
    assert!(
        source
            .try_frame()
            .unwrap_err()
            .to_string()
            .contains("producer failed")
    );
    source.halt().unwrap();
    source.halt().unwrap();
}
