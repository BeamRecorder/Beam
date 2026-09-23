#![cfg(test)]
#![allow(clippy::expect_used)]
use super::*;
use crate::screen::{FrameTimestamp, OwnedVideoFrame, PixelFormat, TimestampSource};
fn sample(sequence: u64) -> OwnedScreenSample {
    OwnedScreenSample {
        frame: OwnedVideoFrame {
            width: 2,
            height: 2,
            stride: 8,
            pixel_format: PixelFormat::Bgra8,
            pixels: Arc::from([0u8; 16]),
        },
        timestamp: FrameTimestamp {
            session_ns: 0,
            native_pts_ns: Some(sequence),
            source: TimestampSource::NativePresentation,
        },
        sequence,
        cursor: CursorSampleState::Unknown,
    }
}
#[test]
fn bounded_queue_preserves_recorded_frames_and_latest_preview() {
    let queue = SampleQueue::new(ScreenQueueLimits {
        frames: 1,
        bytes: 16,
    })
    .expect("queue");
    queue.push(sample(1));
    queue.push(sample(2));
    assert_eq!(queue.depth(), (1, 16));
    assert_eq!(queue.dropped.load(Ordering::Relaxed), 1);
    assert_eq!(queue.preview.take().expect("preview").sequence, 2);
    assert_eq!(queue.pop().expect("read").expect("frame").sequence, 1);
    assert_eq!(queue.depth(), (0, 0));
    assert!(queue.pop().expect("empty").is_none());
}
#[test]
fn byte_limit_and_sticky_failure_do_not_discard_accepted_frame() {
    assert!(
        SampleQueue::new(ScreenQueueLimits {
            frames: 0,
            bytes: 1
        })
        .is_err()
    );
    assert!(
        SampleQueue::new(ScreenQueueLimits {
            frames: 1,
            bytes: 0
        })
        .is_err()
    );
    let queue = SampleQueue::new(ScreenQueueLimits {
        frames: 4,
        bytes: 20,
    })
    .expect("queue");
    queue.push(sample(0));
    queue.push(sample(1));
    queue.fail("first".into());
    queue.fail("second".into());
    assert!(queue.pop().expect("accepted").is_some());
    assert!(
        queue
            .pop()
            .expect_err("terminal")
            .to_string()
            .contains("first")
    );
}
#[test]
fn preparation_and_pause_do_not_admit_recording_frames() {
    let queue = SampleQueue::new(ScreenQueueLimits::default()).expect("queue");
    let clock = SessionClock::start();
    let gate = Arc::new(StartGate::new());
    let (ready, receive) = mpsc::sync_channel(1);
    let mut sink = QueueSink {
        queue: queue.clone(),
        clock: clock.clone(),
        gate: gate.clone(),
        ready: Some(ready),
        format: None,
    };
    sink.push(sample(0)).expect("negotiate");
    assert_eq!(receive.recv().expect("format").width, 2);
    assert_eq!(queue.depth(), (0, 0));
    gate.release(clock.now_ns()).expect("start");
    sink.push(sample(1)).expect("record");
    sink.push_cursor(0, CursorSampleState::Unknown)
        .expect("cursor");
    gate.pause(clock.now_ns()).expect("pause");
    sink.push(sample(2)).expect("paused");
    sink.push_cursor(0, CursorSampleState::Unknown)
        .expect("paused cursor");
    assert_eq!(queue.depth().0, 1);
    assert_eq!(queue.cursors.lock().expect("cursors").len(), 1);
    gate.resume(clock.now_ns()).expect("resume");
    sink.push(sample(3)).expect("resumed");
    assert_eq!(queue.depth().0, 2);
    let mut changed = sample(4);
    changed.frame.width = 1;
    assert!(sink.push(changed).is_err());
    assert!(queue.pop().expect("first").is_some());
    assert!(queue.pop().expect("second").is_some());
    assert!(queue.pop().is_err());
}
