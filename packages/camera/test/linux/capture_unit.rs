#![cfg(test)]
#![allow(clippy::expect_used, clippy::panic)]

use super::*;

fn format() -> CameraFormat {
    CameraFormat {
        width: 1,
        height: 1,
        fps: 30,
        pixel_format: PixelFormat::Bgra,
        stride: 4,
    }
}

fn frame() -> CapturedFrame {
    VideoFrame {
        captured_ns: 123,
        width: 1,
        height: 1,
        data: CameraFrame {
            format: format(),
            native_timestamp_ns: Some(999),
            sequence: 7,
            data: Arc::from([1_u8, 2, 3, 255]),
        },
    }
}

#[test]
fn source_queue_and_latest_preview_have_independent_consumers() {
    let (frame_tx, frames) = crossbeam_channel::bounded(2);
    let (events, event_tx, _) = CameraEventQueue::new();
    let latest = Arc::new(LatestFrame::new());
    let mut capture = CameraCapture {
        frames,
        events,
        latest: latest.clone(),
        queued_bytes: Arc::new(AtomicUsize::new(4)),
        stop: Arc::new(AtomicBool::new(false)),
        worker: None,
        format: format(),
    };
    frame_tx.send(frame()).expect("recording frame");
    latest.publish(frame());
    event_tx
        .try_send(CameraEvent::Started)
        .expect("start event");
    capture.halt().expect("halt before queue drain");
    assert!(capture.stop.load(Ordering::Acquire));
    assert_eq!(capture.queue_depth(), (1, 4));
    assert_eq!(
        capture
            .preview_handle()
            .take()
            .expect("preview")
            .captured_ns,
        123
    );
    assert!(capture.latest_preview().is_none());
    assert!(matches!(capture.try_event(), Some(CameraEvent::Started)));
    assert_eq!(
        capture
            .try_frame()
            .expect("recording queue")
            .expect("frame")
            .data
            .sequence,
        7
    );
    assert_eq!(capture.queue_depth(), (0, 0));
    assert!(capture.try_frame().expect("empty queue").is_none());
    drop(frame_tx);
    assert!(matches!(
        capture.try_frame(),
        Err(CameraError::DeviceUnavailable(_))
    ));
    capture.stop().expect("stop without worker");
}

#[test]
fn worker_exit_and_panic_are_distinct_from_successful_stop() {
    let good = std::thread::spawn(|| Ok(()));
    assert!(join_worker(good).is_ok());
    let failed = std::thread::spawn(|| Err(CameraError::Backend("read failed".into())));
    assert!(
        matches!(join_worker(failed), Err(CameraError::Backend(message)) if message == "read failed")
    );
    let panicked = std::thread::spawn(|| -> Result<(), CameraError> { panic!("worker panic") });
    assert!(
        matches!(join_worker(panicked), Err(CameraError::Backend(message)) if message.contains("panicked"))
    );
}

#[test]
fn halt_reports_worker_error_then_can_be_repeated_safely() {
    let (frame_tx, frames) = crossbeam_channel::bounded(1);
    let (events, _, _) = CameraEventQueue::new();
    let worker = std::thread::spawn(|| Err(CameraError::DeviceUnavailable("unplugged".into())));
    let mut capture = CameraCapture {
        frames,
        events,
        latest: Arc::new(LatestFrame::new()),
        queued_bytes: Arc::new(AtomicUsize::new(0)),
        stop: Arc::new(AtomicBool::new(false)),
        worker: Some(worker),
        format: format(),
    };
    drop(frame_tx);
    assert!(matches!(
        capture.halt(),
        Err(CameraError::DeviceUnavailable(reason)) if reason == "unplugged"
    ));
    assert!(capture.stop.load(Ordering::Acquire));
    assert!(capture.worker.is_none());
    capture.halt().expect("repeat halt after worker joined");
}

#[test]
fn blocked_camera_worker_returns_a_bounded_stop_error() {
    let blocked = std::thread::spawn(|| {
        std::thread::sleep(Duration::from_secs(3));
        Ok(())
    });
    assert!(matches!(
        join_worker(blocked),
        Err(CameraError::Backend(message)) if message.contains("V4L2 camera worker did not stop within 2000 ms")
    ));
}

#[test]
fn only_valid_monotonic_v4l2_timestamps_enter_session_clock() {
    let mut metadata = v4l::buffer::Metadata {
        timestamp: v4l::timestamp::Timestamp::new(12, 345_678),
        ..Default::default()
    };
    assert_eq!(native_timestamp_ns(&metadata), None);
    metadata.flags = Flags::TIMESTAMP_MONOTONIC;
    assert_eq!(native_timestamp_ns(&metadata), Some(12_345_678_000));
    metadata.timestamp = v4l::timestamp::Timestamp::new(-1, 0);
    assert_eq!(native_timestamp_ns(&metadata), None);
    metadata.timestamp = v4l::timestamp::Timestamp::new(1, 1_000_000);
    assert_eq!(native_timestamp_ns(&metadata), None);
    metadata.timestamp = v4l::timestamp::Timestamp::new(i64::MAX, 0);
    assert_eq!(native_timestamp_ns(&metadata), None);
    metadata.timestamp = v4l::timestamp::Timestamp::new(1, -1);
    assert_eq!(native_timestamp_ns(&metadata), None);
    metadata.timestamp = v4l::timestamp::Timestamp::new(0, 999_999);
    assert_eq!(native_timestamp_ns(&metadata), Some(999_999_000));
}

#[test]
fn camera_path_without_a_stable_device_alias_stays_selectable() {
    let temporary = tempfile::tempdir().expect("temporary device-shaped path");
    let path = temporary.path().join("video-test");
    assert_eq!(stable_path(&path), path);
}

#[test]
fn camera_open_distinguishes_permission_denial_from_a_missing_device() {
    let denied = camera_io_error(
        std::io::Error::from(std::io::ErrorKind::PermissionDenied),
        CameraError::DeviceUnavailable,
    );
    assert!(matches!(denied, CameraError::PermissionDenied(_)));
    let absent = camera_io_error(
        std::io::Error::from(std::io::ErrorKind::NotFound),
        CameraError::DeviceUnavailable,
    );
    assert!(matches!(absent, CameraError::DeviceUnavailable(_)));
    let backend = camera_io_error(
        std::io::Error::from(std::io::ErrorKind::BrokenPipe),
        |detail| CameraError::Backend(format!("V4L2 frame read: {detail}")),
    );
    assert!(
        matches!(backend, CameraError::Backend(message) if message.contains("V4L2 frame read"))
    );
}

#[test]
fn format_selection_prefers_raw_yuyv_then_nv12_and_rejects_unknown_formats() {
    let yuyv = FourCC::new(b"YUYV");
    let nv12 = FourCC::new(b"NV12");
    let mjpeg = FourCC::new(b"MJPG");
    assert_eq!(
        choose_fourcc(&[mjpeg, nv12, yuyv]).expect("preferred format"),
        (yuyv, PixelFormat::Yuyv)
    );
    assert_eq!(
        choose_fourcc(&[mjpeg, nv12]).expect("NV12 format"),
        (nv12, PixelFormat::Nv12)
    );
    assert_eq!(
        choose_fourcc(&[mjpeg]).expect("MJPEG format"),
        (mjpeg, PixelFormat::Mjpeg)
    );
    assert!(matches!(
        choose_fourcc(&[FourCC::new(b"H264")]),
        Err(CameraError::UnsupportedFormat(reason)) if reason.contains("H264")
    ));
}

#[test]
fn format_selection_accepts_bgra_and_reports_an_empty_catalog() {
    let bgra = FourCC::new(b"BGRA");
    let mjpeg = FourCC::new(b"MJPG");
    assert_eq!(
        choose_fourcc(&[mjpeg, bgra]).expect("BGRA before MJPEG"),
        (bgra, PixelFormat::Bgra)
    );
    assert_eq!(
        choose_fourcc(&[bgra, bgra]).expect("duplicate BGRA"),
        (bgra, PixelFormat::Bgra)
    );
    assert!(matches!(
        choose_fourcc(&[]),
        Err(CameraError::UnsupportedFormat(reason)) if reason.contains("[]")
    ));
}

#[test]
fn negotiation_rejects_changed_fourcc_and_invalid_fps() {
    let yuyv = FourCC::new(b"YUYV");
    let bgra = FourCC::new(b"BGRA");
    assert!(validate_fourcc(yuyv, yuyv).is_ok());
    assert!(matches!(
        validate_fourcc(yuyv, bgra),
        Err(CameraError::UnsupportedFormat(reason)) if reason.contains("BGRA")
    ));

    let mut negotiated = v4l::Format::new(640, 480, yuyv);
    negotiated.stride = 1_280;
    let format = validated_format(
        PixelFormat::Yuyv,
        negotiated,
        v4l::video::capture::Parameters::with_fps(30),
    )
    .expect("valid negotiation");
    assert_eq!(format.width, 640);
    assert_eq!(format.height, 480);
    assert_eq!(format.stride, 1_280);
    assert_eq!(format.fps, 30);

    let zero_numerator = v4l::video::capture::Parameters::new(v4l::Fraction::new(0, 30));
    assert!(matches!(
        validated_format(PixelFormat::Yuyv, negotiated, zero_numerator),
        Err(CameraError::UnsupportedFormat(reason)) if reason.contains("invalid fps")
    ));
    let sub_one_fps = v4l::video::capture::Parameters::new(v4l::Fraction::new(2, 1));
    assert!(matches!(
        validated_format(PixelFormat::Yuyv, negotiated, sub_one_fps),
        Err(CameraError::UnsupportedFormat(reason)) if reason.contains("invalid fps")
    ));
}

#[test]
fn negotiated_format_preserves_backend_dimensions_and_interval_floor() {
    let mut negotiated = v4l::Format::new(1280, 720, FourCC::new(b"BGRA"));
    negotiated.stride = 5_120;
    let params = v4l::video::capture::Parameters::new(v4l::Fraction::new(1_001, 30_000));
    let format = validated_format(PixelFormat::Bgra, negotiated, params).expect("valid 29.97 fps");
    assert_eq!(format.width, 1280);
    assert_eq!(format.height, 720);
    assert_eq!(format.stride, 5_120);
    assert_eq!(format.pixel_format, PixelFormat::Bgra);
    assert_eq!(format.fps, 29);

    let zero_denominator = v4l::video::capture::Parameters::new(v4l::Fraction::new(1, 0));
    assert!(matches!(
        validated_format(PixelFormat::Bgra, negotiated, zero_denominator),
        Err(CameraError::UnsupportedFormat(reason)) if reason.contains("invalid fps")
    ));
}
