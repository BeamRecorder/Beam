//! Opt-in tests against a disposable X server, never the user's desktop.
#![allow(clippy::unwrap_used, clippy::expect_used)]
use super::{
    Reader, desktop,
    recording::{Request, X11Recording},
};
use crate::{
    model::{CursorSelection, RecordingSettings, ScreenRegion, SourceId},
    screen::{CursorSampleState, ScreenCaptureMetrics, ScreenSegment},
    session::StartGate,
};
use std::{process::Command, sync::Arc, thread, time::Duration};
use x11rb::{
    connection::Connection as _,
    protocol::xproto::{
        AtomEnum, ConfigureWindowAux, ConnectionExt as _, CreateWindowAux, PropMode, WindowClass,
    },
    wrapper::ConnectionExt as _,
};

#[test]
#[ignore = "requires a disposable Xvfb server and FFmpeg; set BEAM_X11_TEST_DISPLAY and DISPLAY"]
fn captures_occluded_windows_regions_resize_and_encoded_pause_segments() {
    let display =
        std::env::var("BEAM_X11_TEST_DISPLAY").expect("explicit disposable X server required");
    assert_eq!(std::env::var("DISPLAY").unwrap(), display);
    assert_ne!(display, ":0", "never run against the user's desktop");
    let (connection, screen) = super::connection::connect().unwrap();
    let root = &connection.setup().roots[screen];
    let target = connection.generate_id().unwrap();
    let cover = connection.generate_id().unwrap();
    for (window, color) in [(target, 0xff0000), (cover, 0x0000ff)] {
        connection
            .create_window(
                root.root_depth,
                window,
                root.root,
                20,
                30,
                100,
                80,
                0,
                WindowClass::INPUT_OUTPUT,
                root.root_visual,
                &CreateWindowAux::new().background_pixel(color),
            )
            .unwrap()
            .check()
            .unwrap();
        connection
            .change_property8(
                PropMode::REPLACE,
                window,
                AtomEnum::WM_NAME,
                AtomEnum::STRING,
                b"Beam disposable capture fixture",
            )
            .unwrap()
            .check()
            .unwrap();
        connection.map_window(window).unwrap().check().unwrap();
    }
    let clients = connection
        .intern_atom(false, b"_NET_CLIENT_LIST_STACKING")
        .unwrap()
        .reply()
        .unwrap()
        .atom;
    connection
        .change_property32(
            PropMode::REPLACE,
            root.root,
            clients,
            AtomEnum::WINDOW,
            &[target, cover],
        )
        .unwrap()
        .check()
        .unwrap();
    connection.flush().unwrap();
    let catalog = desktop::catalog().unwrap();
    let probe = super::super::probe_capture_environment(Duration::from_millis(100));
    assert_eq!(probe.capabilities.backend, "x11");
    assert!(probe.capabilities.recording_available);
    assert!(probe.direct_sources.is_some());
    assert!(probe.diagnostics.linux.unwrap().x11.unwrap().available);
    assert!(catalog.windows);
    let monitor = catalog
        .sources
        .iter()
        .find(|source| source.id.as_str().starts_with("x11:monitor:"))
        .unwrap();
    let source = SourceId::new(format!("x11:window:{target}")).unwrap();
    assert!(catalog.sources.iter().any(|item| item.id == source));
    let region = ScreenRegion {
        x: 0.025,
        y: 0.05,
        width: 0.05,
        height: 0.05,
    };
    let mut crop = Reader::open(&monitor.id, Some(region), true).unwrap();
    let (frame, _, _) = crop.read(false, false).unwrap();
    assert_eq!(
        &frame.pixels[..4],
        &[255, 0, 0, 255],
        "monitor sees the blue cover"
    );
    let mut reader = Reader::open(&source, None, true).unwrap();
    // Repaint after redirect, just as a real application/compositor would.
    connection
        .clear_area(false, target, 0, 0, 0, 0)
        .unwrap()
        .check()
        .unwrap();
    let (frame, cursor, _) = reader.read(false, true).unwrap();
    assert_eq!(
        &frame.pixels[..4],
        &[0, 0, 255, 255],
        "Composite captures the red window behind the blue cover"
    );
    assert!(matches!(cursor, CursorSampleState::Known { .. }));
    connection
        .configure_window(target, &ConfigureWindowAux::new().width(60).height(40))
        .unwrap()
        .check()
        .unwrap();
    connection
        .clear_area(false, target, 0, 0, 0, 0)
        .unwrap()
        .check()
        .unwrap();
    let (resized, _, _) = reader.read(false, false).unwrap();
    assert_eq!((resized.width, resized.height), (100, 80));
    assert_eq!(
        &resized.pixels[..4],
        &[0, 0, 0, 255],
        "resize preserves the encoder's output dimensions with letterboxing"
    );
    drop(reader);

    let directory = tempfile::tempdir().unwrap();
    let preview_config = crate::screenshot::ScreenshotRequest {
        screen: crate::model::ScreenSelection::Source {
            source_id: monitor.id.clone(),
        },
        region: None,
        output: directory.path().join("preview.png"),
        excluded_window_handles: vec![],
    };
    let (selection, preview) =
        crate::screen::RegionSelection::prepare(preview_config.clone(), CursorSelection::Disabled)
            .unwrap();
    assert_eq!(
        (preview.dimensions.width, preview.dimensions.height),
        (800, 600)
    );
    assert_eq!(preview.display.position, Some((0, 0)));
    let screenshot = crate::screenshot::capture_with_selection(
        crate::screenshot::ScreenshotRequest {
            region: Some(region),
            output: directory.path().join("crop.png"),
            ..preview_config
        },
        Some(selection),
    )
    .unwrap();
    assert_eq!((screenshot.width, screenshot.height), (40, 30));
    let thumbnail = crate::screen::capture_source_preview(&source, 300, 200).unwrap();
    assert_eq!(thumbnail.source_id, source);
    assert!(thumbnail.thumbnail.starts_with("data:image/jpeg;base64,"));
    let settings = RecordingSettings {
        target_fps: 15,
        ..RecordingSettings::default()
    };
    let first = directory.path().join("first.mp4");
    let second = directory.path().join("second.mp4");
    let sink = super::super::FfmpegScreenSink::new(
        super::super::probe_ffmpeg().unwrap(),
        settings.clone(),
        ScreenSegment {
            path: first.clone(),
            start_ns: 0,
        },
        Some(directory.path().to_path_buf()),
        false,
    )
    .unwrap();
    let gate = Arc::new(StartGate::new());
    let mut recording = X11Recording::prepare(Request {
        source: &source,
        region: None,
        settings: &settings,
        sink: Box::new(sink),
        gate: gate.clone(),
        cursor: CursorSelection::Separate {
            capture_clicks: false,
            capture_shortcuts: false,
            capture_shape: true,
        },
        show_real_cursor: false,
        metrics: Arc::new(ScreenCaptureMetrics::default()),
        encode: true,
    })
    .unwrap();
    assert!(
        recording.start().is_err(),
        "capture must wait for the shared start gate"
    );
    gate.release(1).unwrap();
    recording.start().unwrap();
    thread::sleep(Duration::from_millis(350));
    recording.pause().unwrap();
    let size = std::fs::metadata(&first).unwrap().len();
    thread::sleep(Duration::from_millis(200));
    assert_eq!(std::fs::metadata(&first).unwrap().len(), size);
    let resumed = Arc::new(StartGate::new());
    recording
        .prepare_resume(
            resumed.clone(),
            Some(ScreenSegment {
                path: second.clone(),
                start_ns: 600_000_000,
            }),
        )
        .unwrap();
    resumed.release_at(2, 600_000_000).unwrap();
    recording.start().unwrap();
    thread::sleep(Duration::from_millis(350));
    recording.stop().unwrap();
    recording.stop().unwrap();
    for file in [first, second] {
        let result = Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height,duration,nb_frames",
                "-of",
                "json",
            ])
            .arg(&file)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        let value: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
        let stream = &value["streams"][0];
        assert_eq!(stream["width"], 60);
        assert_eq!(stream["height"], 40);
        assert!(
            stream["nb_frames"]
                .as_str()
                .unwrap()
                .parse::<u32>()
                .unwrap()
                >= 3
        );
        assert!(stream["duration"].as_str().unwrap().parse::<f64>().unwrap() < 0.6);
    }
    assert!(directory.path().join("cursor.json").exists());
    // Exercise the public recording session as well as the backend worker:
    // pause must retain the same cursor writer and source session.
    let request: crate::model::CaptureRequest = serde_json::from_value(serde_json::json!({
        "projectId": crate::model::ProjectId::new(),
        "screen": { "mode": "source", "sourceId": source.as_str() },
        "cursor": { "mode": "separate", "captureClicks": false, "captureShortcuts": false, "captureShape": true },
        "recording": { "outputRoot": directory.path(), "videoBitrateBps": 1000000, "targetFps": 15, "keyframeIntervalSeconds": 2, "queueCapacity": 2, "minimumFreeBytes": 0 },
        "failurePolicy": "fail-fast"
    })).unwrap();
    let snapshot =
        crate::catalog::SourceCatalog::snapshot(&crate::catalog::NativeCatalog::default()).unwrap();
    let mut session = crate::session::RecordingSession::prepare(request, snapshot).unwrap();
    session.start().unwrap();
    thread::sleep(Duration::from_millis(250));
    session.pause().unwrap();
    thread::sleep(Duration::from_millis(150));
    session.resume().unwrap();
    thread::sleep(Duration::from_millis(250));
    let manifest_path = session.stop().unwrap();
    let manifest: crate::model::SessionManifest =
        crate::storage::read_json(&manifest_path).unwrap();
    let screens: Vec<_> = manifest
        .tracks
        .iter()
        .filter(|track| track.kind == crate::model::TrackKind::Screen)
        .collect();
    assert_eq!(screens.len(), 1);
    assert_eq!(screens[0].segments.len(), 2);
    assert!(matches!(
        screens[0].format,
        crate::model::TrackFormat::Video {
            width: 60,
            height: 40,
            ..
        }
    ));
    let cursor = manifest
        .tracks
        .iter()
        .find(|track| track.kind == crate::model::TrackKind::Cursor)
        .unwrap();
    assert_eq!(cursor.segments.len(), 1);
    let cursor_data: serde_json::Value =
        crate::storage::read_json(&manifest_path.parent().unwrap().join("cursor/cursor.json"))
            .unwrap();
    let cursor_text = cursor_data.to_string();
    assert!(cursor_text.contains("x11:cursor:"));
    let mut closed = Reader::open(&source, None, true).unwrap();
    connection.destroy_window(target).unwrap().check().unwrap();
    assert!(closed.read(false, false).is_err());
    assert!(Reader::open(&source, None, true).is_err());
}

#[test]
#[ignore = "requires disposable Xvfb with -extension Composite"]
fn monitors_remain_available_without_composite() {
    let display = std::env::var("BEAM_X11_TEST_DISPLAY").unwrap();
    assert_eq!(std::env::var("DISPLAY").unwrap(), display);
    assert_ne!(display, ":0");
    let catalog = desktop::catalog().unwrap();
    assert!(!catalog.windows);
    assert!(
        catalog
            .sources
            .iter()
            .all(|source| source.kind == crate::model::SourceKind::Display)
    );
    let source = &catalog.sources[0].id;
    let mut reader = Reader::open(source, None, false).unwrap();
    assert_eq!(reader.read(false, false).unwrap().0.width, 800);
}
