#![allow(clippy::expect_used)]

use std::{
    sync::Arc,
    thread,
    time::{Duration, Instant},
};

use beam_camera::{CameraEvent, CameraQueueLimits, CameraRequest, list_cameras, open_camera};
use beam_media_core::{MonotonicClock, SessionClock, StartGate};

#[test]
#[ignore = "requires a real camera and OS camera permission"]
fn capture_native_frames_and_stop() {
    let device = list_cameras()
        .expect("camera discovery")
        .into_iter()
        .next()
        .expect("camera");
    let clock = SessionClock::start();
    let gate = Arc::new(StartGate::new());
    let request = CameraRequest {
        device_id: device.id,
        width: 640,
        height: 480,
        fps: 30,
    };
    let capture = open_camera(
        request.clone(),
        clock.clone(),
        gate.clone(),
        CameraQueueLimits::default(),
    )
    .expect("open camera");
    gate.release(clock.now_ns()).expect("start gate");
    assert!(capture.queue_depth().0 <= CameraQueueLimits::default().frames);
    let preview = capture.preview_handle();
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut captured = 0;
    let mut previews = 0;
    while Instant::now() < deadline && captured < 3 {
        if let Some(frame) = capture.try_frame().expect("capture frame") {
            let rgba = frame.data.to_rgba().expect("convert frame");
            assert_eq!(rgba.len(), frame.width as usize * frame.height as usize * 4);
            if let Some(current_preview) = preview.take() {
                assert!(current_preview.captured_ns >= frame.captured_ns);
                previews += 1;
            }
            captured += 1;
        }
        thread::sleep(Duration::from_millis(10));
    }
    assert!(
        captured >= 3,
        "camera must deliver at least three native frames"
    );
    assert!(previews > 0, "camera must also publish preview frames");
    let drop_deadline = Instant::now() + Duration::from_secs(5);
    let mut queue_full = false;
    while Instant::now() < drop_deadline && !queue_full {
        queue_full = matches!(capture.try_event(), Some(CameraEvent::Dropped { .. }));
        thread::sleep(Duration::from_millis(10));
    }
    assert!(
        queue_full,
        "a full recording queue must report dropped frames"
    );
    assert!(
        capture.latest_preview().is_some(),
        "preview continues when recording queue fills"
    );
    capture.stop().expect("camera stop");

    let second_clock = SessionClock::start();
    let second_gate = Arc::new(StartGate::new());
    let byte_limited = open_camera(
        request,
        second_clock.clone(),
        second_gate.clone(),
        CameraQueueLimits {
            frames: 1,
            bytes: 1,
        },
    )
    .expect("reopen camera with a one-byte recording budget");
    second_gate
        .release(second_clock.now_ns())
        .expect("second start gate");
    let drop_deadline = Instant::now() + Duration::from_secs(5);
    let mut byte_drop = false;
    while Instant::now() < drop_deadline && !byte_drop {
        byte_drop = matches!(byte_limited.try_event(), Some(CameraEvent::Dropped { .. }));
        thread::sleep(Duration::from_millis(10));
    }
    assert!(byte_drop, "byte budget must reject oversized native frames");
    assert_eq!(byte_limited.queue_depth(), (0, 0));
    assert!(byte_limited.latest_preview().is_some());
    byte_limited.stop().expect("stop byte-limited camera");
}
