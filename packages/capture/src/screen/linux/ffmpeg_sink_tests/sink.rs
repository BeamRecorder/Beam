use std::{fs, os::unix::fs::PermissionsExt, sync::Arc};

use crate::{
    cursor::{CursorKind, Hotspot},
    model::RecordingSettings,
    screen::{
        CursorSampleState, FrameTimestamp, OwnedScreenSample, OwnedVideoFrame, PixelFormat,
        ScreenSampleSink, ScreenSegment, TimestampSource, VideoFormat,
    },
};

use super::super::{FfmpegCapabilities, FfmpegScreenSink};
use crate::screen::linux::FfmpegEncoder;
use crate::screen::linux::owned_child;

#[test]
fn sink_rotates_atomic_segments_and_finalizes_cursor_sidecars() {
    let _lock = owned_child::test_lock();
    let temporary = tempfile::tempdir().expect("temporary sink directory");
    let executable = fake_ffmpeg(&temporary);
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
    sink.format_changed(video_format())
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
    let _lock = owned_child::test_lock();
    crate::screen::linux::shutdown_linux_input_access();

    let temporary = tempfile::tempdir().expect("temporary sink directory");
    let executable = fake_ffmpeg(&temporary);
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

    sink.format_changed(video_format())
        .expect("announce format");
    sink.push(sample(10)).expect("write sample");
    sink.finish().expect("finalize sink");

    assert_eq!(fs::read(output).expect("video segment"), b"fake-mp4");
    assert!(cursor.join("cursor.json").is_file());
    assert!(cursor.join("telemetry.json").is_file());
    assert!(cursor.join("shapes.json").is_file());
    assert!(!cursor.join("input.json").exists());
}

fn fake_ffmpeg(temporary: &tempfile::TempDir) -> std::path::PathBuf {
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
    executable
}

fn video_format() -> VideoFormat {
    VideoFormat {
        width: 2,
        height: 2,
        stride: 8,
        pixel_format: PixelFormat::Bgra8,
    }
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
            cursor_kind: CursorKind::Default,
            pixel_x: 1,
            pixel_y: 1,
            normalized_x: 0.5,
            normalized_y: 0.5,
            visible: true,
            hotspot: Some(Hotspot { x: 0, y: 0 }),
        },
    }
}
