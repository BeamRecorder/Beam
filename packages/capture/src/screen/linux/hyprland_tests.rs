#![allow(clippy::expect_used)]

use super::super::pipewire::{NativePixelFormat, map_cursor_metadata};
use super::*;
use std::os::unix::net::UnixListener;

fn monitors() -> Vec<HyprlandMonitor> {
    serde_json::from_str(
        r#"[
        {"name":"DP-1","x":-1536,"y":0,"width":1920,"height":1080,"scale":1.25,"focused":false},
        {"name":"DP-2","x":0,"y":100,"width":1920,"height":1080,"scale":2.0,"focused":true}
    ]"#,
    )
    .expect("typed monitors")
}

fn cursor(snapshot: Option<CursorSnapshot>) -> HyprlandCursor {
    let (stop, _) = mpsc::channel();
    HyprlandCursor {
        snapshot: Arc::new(Mutex::new(snapshot)),
        stop,
        worker: None,
    }
}

#[test]
fn parses_signed_and_fragmented_cursor_responses_and_rejects_invalid_data() {
    assert_eq!(parse_cursor_pos(b"123, 456\n"), Some((123, 456)));
    assert_eq!(parse_cursor_pos(b" -50, -20 \r\n"), Some((-50, -20)));
    let chunks: &[&[u8]] = &[b"12", b"3, ", b"45", b"6\n"];
    assert_eq!(parse_cursor_pos(&chunks.concat()), Some((123, 456)));
    for response in [
        b"".as_slice(),
        b"1",
        b"1,",
        b"1,2,3",
        b"abc, 2",
        b"2147483648,0",
        b"\xff,0",
    ] {
        assert_eq!(parse_cursor_pos(response), None);
    }
}

#[test]
fn selects_the_portal_monitor_instead_of_the_focused_monitor() {
    let monitors = monitors();
    let selected = select_monitor(&monitors, Some("DP-1"), Some((1920, 1080))).expect("mapping id");
    assert_eq!(selected.name, "DP-1");
    assert_eq!(selected.scale, 1.25);
    assert!(select_monitor(&monitors, Some("missing"), Some((1920, 1080))).is_none());
}

#[test]
fn unidentified_same_sized_outputs_are_rejected_instead_of_guessing() {
    let monitors = monitors();
    assert!(select_monitor(&monitors, None, Some((1920, 1080))).is_none());
    assert!(select_monitor(&monitors, None, None).is_none());
    assert!(select_monitor(&[], None, None).is_none());
    assert_eq!(
        select_monitor(&monitors[..1], None, None)
            .expect("single monitor")
            .name,
        "DP-1"
    );
}

#[test]
fn unique_physical_stream_size_identifies_older_portal_outputs() {
    let mut monitors = monitors();
    monitors[1].width = 2560;
    monitors[1].height = 1440;
    assert_eq!(
        select_monitor(&monitors, None, Some((2560, 1440)))
            .expect("unique dimensions")
            .name,
        "DP-2"
    );
    monitors[1].transform = 1;
    assert_eq!(
        select_monitor(&monitors, None, Some((1440, 2560)))
            .expect("rotated dimensions")
            .name,
        "DP-2"
    );
    assert!(select_monitor(&monitors, None, Some((-1, 0))).is_none());
}

#[test]
fn monitor_json_and_geometry_require_real_valid_fields() {
    for json in ["invalid", "{}", "[{\"name\":\"DP-1\"}]"] {
        assert!(serde_json::from_str::<Vec<HyprlandMonitor>>(json).is_err());
    }
    for scale in [0.0, -1.0, f64::INFINITY, f64::NAN] {
        let mut monitors = monitors();
        monitors[0].scale = scale;
        assert!(select_monitor(&monitors, Some("DP-1"), None).is_none());
    }
    let mut monitor = monitors().remove(0);
    monitor.width = 0;
    assert!(!monitor.valid());
    monitor.width = 1920;
    monitor.transform = 8;
    assert!(!monitor.valid());
}

#[test]
fn fractional_scale_negative_offsets_and_outside_positions_remain_relative_to_capture() {
    let monitor = monitors().remove(0);
    let snapshot = CursorSnapshot {
        point: (-768, 432),
        monitor,
        received: Instant::now(),
    };
    let format = NegotiatedFormat::new(1920, 1080, NativePixelFormat::Bgra).expect("format");
    let cursor = cursor(Some(snapshot));
    let metadata = cursor
        .metadata(format, VideoTransform::None)
        .expect("fresh snapshot");
    assert_eq!((metadata.x, metadata.y), (960, 540));
    cursor
        .snapshot
        .lock()
        .expect("snapshot")
        .as_mut()
        .expect("point")
        .point = (0, 432);
    assert_eq!(
        cursor
            .metadata(format, VideoTransform::None)
            .expect("outside position")
            .x,
        1920
    );
}

#[test]
fn every_spa_transform_is_applied_once_to_compositor_coordinates() {
    let monitor = monitors().remove(0);
    let format = NegotiatedFormat::new(1920, 1080, NativePixelFormat::Bgra).expect("format");
    for transform in [
        VideoTransform::None,
        VideoTransform::Rotated90,
        VideoTransform::Rotated180,
        VideoTransform::Rotated270,
        VideoTransform::Flipped,
        VideoTransform::Flipped90,
        VideoTransform::Flipped180,
        VideoTransform::Flipped270,
    ] {
        let cursor = cursor(Some(CursorSnapshot {
            point: (-1152, 216),
            monitor: monitor.clone(),
            received: Instant::now(),
        }));
        let raw = cursor.metadata(format, transform);
        let mapped = map_cursor_metadata(raw, format.width, format.height, None, transform)
            .expect("mapped cursor");
        let swapped = matches!(
            transform,
            VideoTransform::Rotated90
                | VideoTransform::Rotated270
                | VideoTransform::Flipped90
                | VideoTransform::Flipped270
        );
        assert_eq!(
            (mapped.x, mapped.y),
            if swapped { (270, 480) } else { (480, 270) }
        );
    }
}

#[test]
fn missing_or_stale_ipc_samples_are_not_reused_as_live_cursor_positions() {
    let format = NegotiatedFormat::new(1920, 1080, NativePixelFormat::Bgra).expect("format");
    assert!(
        cursor(None)
            .metadata(format, VideoTransform::None)
            .is_none()
    );
    let cursor = cursor(Some(CursorSnapshot {
        point: (1, 1),
        monitor: monitors().remove(0),
        received: Instant::now() - Duration::from_secs(1),
    }));
    assert!(cursor.metadata(format, VideoTransform::None).is_none());
}

#[test]
fn ipc_reads_fragmented_responses_and_bounds_oversized_or_silent_peers() {
    for mode in 0..3 {
        let directory = tempfile::tempdir().expect("temporary socket");
        let path = directory.path().join("socket");
        let listener = UnixListener::bind(&path).expect("listener");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("connection");
            let mut request = [0; 32];
            let _ = stream.read(&mut request);
            match mode {
                0 => {
                    let _ = stream.write_all(b"12");
                    let _ = stream.write_all(b"3, 456\n");
                }
                1 => {
                    let _ = stream.write_all(&vec![b'x'; 32769]);
                }
                _ => thread::sleep(Duration::from_millis(60)),
            }
        });
        let response = query(&path, b"/cursorpos");
        if mode == 0 {
            assert_eq!(
                parse_cursor_pos(&response.expect("complete response")),
                Some((123, 456))
            );
        } else {
            assert!(response.is_none());
        }
        server.join().expect("server finished");
    }
}

#[test]
fn sampling_failure_clears_the_snapshot_and_worker_stops_on_drop() {
    let directory = tempfile::tempdir().expect("temporary socket");
    let path = directory.path().join("socket");
    let listener = UnixListener::bind(&path).expect("listener");
    let server = thread::spawn(move || {
        for response in [b"100, 100".as_slice(), b"invalid"] {
            let (mut stream, _) = listener.accept().expect("connection");
            let mut request = [0; 32];
            let _ = stream.read(&mut request);
            let _ = stream.write_all(response);
        }
    });
    let cursor = HyprlandCursor::start(path, monitors().remove(0)).expect("start sampler");
    let deadline = Instant::now() + Duration::from_secs(1);
    while cursor.snapshot.lock().expect("snapshot").is_some() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(5));
    }
    assert!(cursor.snapshot.lock().expect("snapshot").is_none());
    drop(cursor);
    server.join().expect("server finished");
}
