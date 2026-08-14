#![allow(clippy::expect_used)]

use std::{fs, os::unix::fs::PermissionsExt, path::PathBuf, sync::Arc};

use crate::{
    cursor::Hotspot,
    model::RecordingSettings,
    screen::{
        CursorSampleState, FrameTimestamp, OwnedScreenSample, OwnedVideoFrame, PixelFormat,
        ScreenSampleSink, ScreenSegment, TimestampSource, VideoFormat,
    },
};

use crate::screen::linux::FfmpegEncoder;

use super::{CursorOutput, FfmpegCapabilities, FfmpegScreenSink, encoded_video_format};

#[test]
fn encoded_format_pads_odd_dimensions_for_yuv420() {
    let actual = encoded_video_format(VideoFormat {
        width: 1919,
        height: 1079,
        stride: 7_676,
        pixel_format: PixelFormat::Bgra8,
    });
    assert_eq!(
        (actual.width, actual.height, actual.stride),
        (1920, 1080, 7680)
    );
}

#[test]
fn encoded_format_preserves_even_dimensions() {
    let actual = encoded_video_format(VideoFormat {
        width: 1280,
        height: 720,
        stride: 5_120,
        pixel_format: PixelFormat::Bgra8,
    });
    assert_eq!((actual.width, actual.height), (1280, 720));
}

#[test]
fn cursor_samples_keep_native_identity_visibility_and_hotspot() {
    let mut output = CursorOutput::new(PathBuf::from("unused"));
    let sample = CursorSampleState::Known {
        native_cursor_id: "pipewire:stream:7".into(),
        pixel_x: -2,
        pixel_y: 9,
        normalized_x: -0.1,
        normalized_y: 0.5,
        visible: true,
        hotspot: Some(Hotspot { x: 2, y: 3 }),
    };
    let temporary = tempfile::tempdir().expect("temporary cursor directory");
    output.directory = temporary.path().into();
    output.push_sample(42, sample).expect("cursor sample");
    assert_eq!(output.events.len(), 3);
    assert_eq!(output.shapes.len(), 1);
    assert_eq!(output.previous_visibility, Some(true));
}

#[test]
fn cursor_samples_emit_a_shape_sidecar_without_a_hotspot() {
    let temporary = tempfile::tempdir().expect("temporary cursor directory");
    let mut output = CursorOutput::new(temporary.path().into());
    output
        .push_sample(
            42,
            CursorSampleState::Known {
                native_cursor_id: "pipewire:stream:9".into(),
                pixel_x: 10,
                pixel_y: 12,
                normalized_x: 0.25,
                normalized_y: 0.5,
                visible: true,
                hotspot: None,
            },
        )
        .expect("cursor sample");

    assert!(matches!(
        output.events.first(),
        Some(crate::cursor::CursorEvent::Shape {
            cursor_id,
            native_cursor_id,
            hotspot,
            ..
        }) if cursor_id == "pipewire:stream:9"
            && native_cursor_id == "pipewire:stream:9"
            && hotspot == &Hotspot { x: 0, y: 0 }
    ));
    assert_eq!(output.shapes.len(), 1);
    assert_eq!(
        output.shapes["pipewire:stream:9"].hotspot,
        Hotspot { x: 0, y: 0 }
    );
}

#[test]
fn cursor_samples_emit_distinct_shapes_for_native_ids_without_bitmaps() {
    let temporary = tempfile::tempdir().expect("temporary cursor directory");
    let mut output = CursorOutput::new(temporary.path().into());
    for (session_ns, native_cursor_id) in [(10, "pipewire:stream:17"), (20, "pipewire:stream:23")] {
        output
            .push_sample(
                session_ns,
                CursorSampleState::Known {
                    native_cursor_id: native_cursor_id.into(),
                    pixel_x: 10,
                    pixel_y: 12,
                    normalized_x: 0.25,
                    normalized_y: 0.5,
                    visible: true,
                    // No bitmap-derived shape data is available; the raw SPA
                    // identity still needs to produce a distinct Shape event.
                    hotspot: None,
                },
            )
            .expect("cursor sample");
    }

    let shape_ids: Vec<&str> = output
        .events
        .iter()
        .filter_map(|event| match event {
            crate::cursor::CursorEvent::Shape { cursor_id, .. } => Some(cursor_id.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(shape_ids, ["pipewire:stream:17", "pipewire:stream:23"]);
    assert_eq!(output.shapes.len(), 2);
    assert!(output.shapes.contains_key("pipewire:stream:17"));
    assert!(output.shapes.contains_key("pipewire:stream:23"));
}

#[test]
fn unknown_cursor_sample_does_not_invent_events() {
    let temporary = tempfile::tempdir().expect("temporary cursor directory");
    let mut output = CursorOutput::new(temporary.path().into());
    output
        .push_sample(42, CursorSampleState::Unknown)
        .expect("unknown sample");
    assert!(output.events.is_empty());
    assert!(!temporary.path().join("cursor.partial.jsonl").exists());
}

#[test]
fn sink_rotates_atomic_segments_and_finalizes_cursor_sidecars() {
    let temporary = tempfile::tempdir().expect("temporary sink directory");
    let executable = temporary.path().join("ffmpeg-fake");
    fs::write(
        &executable,
        "#!/bin/sh\nfor output do :; done\nwc -c >/dev/null\nprintf 'fake-mp4' > \"$output\"\n",
    )
    .expect("write fake FFmpeg");
    let mut permissions = fs::metadata(&executable)
        .expect("fake FFmpeg metadata")
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&executable, permissions).expect("make fake FFmpeg executable");
    let screen = temporary.path().join("screen");
    let cursor = temporary.path().join("cursor");
    let first = screen.join("segment-0001.mp4");
    let second = screen.join("segment-0002.mp4");
    let mut sink = FfmpegScreenSink::new(
        FfmpegCapabilities {
            executable,
            encoder: FfmpegEncoder::software("libopenh264"),
        },
        RecordingSettings {
            minimum_free_bytes: 0,
            target_fps: 30,
            ..RecordingSettings::default()
        },
        ScreenSegment {
            path: first.clone(),
            start_ns: 0,
        },
        Some(cursor.clone()),
        false,
    )
    .expect("create FFmpeg sink");
    sink.format_changed(VideoFormat {
        width: 2,
        height: 2,
        stride: 8,
        pixel_format: PixelFormat::Bgra8,
    })
    .expect("announce format");
    sink.push(sample(10)).expect("first sample");
    sink.end_segment().expect("finish first segment");
    sink.begin_segment(ScreenSegment {
        path: second.clone(),
        start_ns: 100,
    })
    .expect("begin second segment");
    sink.push(sample(110)).expect("second sample");
    sink.finish().expect("finalize sink");

    assert_eq!(fs::read(first).expect("first segment"), b"fake-mp4");
    assert_eq!(fs::read(second).expect("second segment"), b"fake-mp4");
    let events: Vec<crate::cursor::CursorEvent> =
        serde_json::from_slice(&fs::read(cursor.join("cursor.json")).expect("cursor events"))
            .expect("parse cursor events");
    assert!(events.len() >= 4);
    assert!(cursor.join("telemetry.json").is_file());
    assert!(cursor.join("shapes.json").is_file());
    assert!(!cursor.join("cursor.partial.jsonl").exists());
}

#[test]
fn sink_without_an_active_input_broker_keeps_video_and_cursor_sidecars_without_input_json() {
    crate::screen::linux::shutdown_linux_input_access();

    let temporary = tempfile::tempdir().expect("temporary sink directory");
    let executable = temporary.path().join("ffmpeg-fake");
    fs::write(
        &executable,
        "#!/bin/sh\nfor output do :; done\nwc -c >/dev/null\nprintf 'fake-mp4' > \"$output\"\n",
    )
    .expect("write fake FFmpeg");
    let mut permissions = fs::metadata(&executable)
        .expect("fake FFmpeg metadata")
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&executable, permissions).expect("make fake FFmpeg executable");

    let screen = temporary.path().join("screen");
    let cursor = temporary.path().join("cursor");
    let output = screen.join("segment-0001.mp4");
    let mut sink = FfmpegScreenSink::new(
        FfmpegCapabilities {
            executable,
            encoder: FfmpegEncoder::software("libopenh264"),
        },
        RecordingSettings {
            minimum_free_bytes: 0,
            target_fps: 30,
            ..RecordingSettings::default()
        },
        ScreenSegment {
            path: output.clone(),
            start_ns: 0,
        },
        Some(cursor.clone()),
        true,
    )
    .expect("create FFmpeg sink");

    sink.format_changed(VideoFormat {
        width: 2,
        height: 2,
        stride: 8,
        pixel_format: PixelFormat::Bgra8,
    })
    .expect("announce format");
    sink.push(sample(10)).expect("write sample");
    sink.finish().expect("finalize sink");

    assert_eq!(fs::read(output).expect("video segment"), b"fake-mp4");
    assert!(cursor.join("cursor.json").is_file());
    assert!(cursor.join("telemetry.json").is_file());
    assert!(cursor.join("shapes.json").is_file());
    assert!(!cursor.join("input.json").exists());
}

fn sample(session_ns: u64) -> OwnedScreenSample {
    OwnedScreenSample {
        frame: OwnedVideoFrame {
            width: 2,
            height: 2,
            stride: 8,
            pixel_format: PixelFormat::Bgra8,
            pixels: Arc::from(vec![0; 16]),
        },
        timestamp: FrameTimestamp {
            session_ns,
            native_pts_ns: Some(session_ns),
            source: TimestampSource::NativePresentation,
        },
        sequence: session_ns,
        cursor: CursorSampleState::Known {
            native_cursor_id: "pipewire:stream:7".into(),
            pixel_x: 1,
            pixel_y: 1,
            normalized_x: 0.5,
            normalized_y: 0.5,
            visible: true,
            hotspot: Some(Hotspot { x: 0, y: 0 }),
        },
    }
}
