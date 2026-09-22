#![cfg(test)]
#![allow(clippy::expect_used)]

use crate::{
    model::RecordingSettings,
    screen::{
        CursorSampleState, FrameTimestamp, OwnedScreenSample, OwnedVideoFrame, ScreenDiscontinuity,
        ScreenSampleSink, ScreenSegment, TimestampSource, VideoFormat,
    },
};
use std::{fs, path::PathBuf, sync::Arc};

use super::super::FfmpegScreenSink;
use crate::screen::linux::{FfmpegCapabilities, FfmpegEncoder};

fn format() -> VideoFormat {
    VideoFormat {
        width: 2,
        height: 2,
        stride: 8,
        pixel_format: crate::screen::PixelFormat::Bgra8,
    }
}

fn segment(path: PathBuf) -> ScreenSegment {
    ScreenSegment { path, start_ns: 0 }
}

fn new_sink(path: PathBuf, cursor: Option<PathBuf>) -> FfmpegScreenSink {
    FfmpegScreenSink::new(
        FfmpegCapabilities {
            executable: path.with_file_name("missing-ffmpeg"),
            encoder: FfmpegEncoder::software("libopenh264"),
        },
        RecordingSettings::default(),
        segment(path),
        cursor,
        false,
    )
    .expect("create sink")
}

#[test]
fn new_rejects_non_mp4_case_and_missing_extension() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    for name in ["segment.mkv", "segment.MP4", "segment"] {
        let path = temporary.path().join(name);
        let error = FfmpegScreenSink::new(
            FfmpegCapabilities {
                executable: PathBuf::from("missing-ffmpeg"),
                encoder: FfmpegEncoder::software("libopenh264"),
            },
            RecordingSettings::default(),
            segment(path),
            None,
            false,
        )
        .err()
        .expect("invalid extension");
        assert_eq!(error.code(), "invalid-configuration");
    }
}

#[test]
fn format_rejects_zero_dimensions_and_short_stride_before_spawn() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    for invalid in [
        VideoFormat {
            width: 0,
            ..format()
        },
        VideoFormat {
            height: 0,
            ..format()
        },
        VideoFormat {
            stride: 7,
            ..format()
        },
    ] {
        let mut sink = new_sink(temporary.path().join("segment.mp4"), None);
        let error = sink.format_changed(invalid).expect_err("invalid format");
        assert_eq!(error.code(), "ffmpeg-failed");
        assert!(sink.format.is_none());
    }
}

#[test]
fn repeated_format_is_idempotent_but_mid_session_change_is_rejected() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let mut sink = new_sink(temporary.path().join("segment.mp4"), None);
    sink.format = Some(format());
    sink.format_changed(format()).expect("same format");
    let changed = VideoFormat {
        width: 4,
        stride: 16,
        ..format()
    };
    let error = sink.format_changed(changed).expect_err("changed format");
    assert_eq!(error.code(), "pipewire-format-unsupported");
    assert_eq!(sink.format, Some(format()));
}

#[test]
fn segment_state_rejects_overlap_and_finalized_resume() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let mut sink = new_sink(temporary.path().join("first.mp4"), None);
    let next = segment(temporary.path().join("next.mp4"));
    let error = sink.begin_segment(next.clone()).expect_err("overlap");
    assert_eq!(error.code(), "ffmpeg-failed");
    sink.current_segment = None;
    sink.begin_segment(next.clone()).expect("new idle segment");
    assert_eq!(sink.current_segment, Some(next.clone()));
    sink.current_segment = None;
    sink.finished = true;
    let error = sink.begin_segment(next).expect_err("finalized sink");
    assert!(error.to_string().contains("finalized"));
}

#[test]
fn missing_segment_or_format_reports_error_without_spawning_ffmpeg() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let mut sink = new_sink(temporary.path().join("segment.mp4"), None);
    sink.current_segment = None;
    let error = sink.end_segment().expect_err("no segment");
    assert!(error.to_string().contains("no active FFmpeg segment"));
    let error = sink
        .format_changed(format())
        .expect_err("format without segment");
    assert!(
        error
            .to_string()
            .contains("without an active screen segment")
    );

    let mut sink = new_sink(temporary.path().join("other.mp4"), None);
    let error = sink.end_segment().expect_err("no negotiated format");
    assert!(error.to_string().contains("received no format"));
    assert!(sink.current_segment.is_none());
}

#[test]
fn sample_without_active_process_fails_after_matching_format() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let mut sink = new_sink(temporary.path().join("segment.mp4"), None);
    sink.format = Some(format());
    let sample = OwnedScreenSample {
        frame: OwnedVideoFrame {
            width: 2,
            height: 2,
            stride: 8,
            pixel_format: crate::screen::PixelFormat::Bgra8,
            pixels: Arc::from(vec![0; 16]),
        },
        timestamp: FrameTimestamp {
            session_ns: 1,
            native_pts_ns: Some(1),
            source: TimestampSource::NativePresentation,
        },
        sequence: 1,
        cursor: CursorSampleState::Unknown,
    };
    let error = sink.push(sample).expect_err("no process");
    assert_eq!(error.code(), "ffmpeg-failed");
    assert!(error.to_string().contains("not running"));
}

#[test]
fn discontinuity_requires_positive_lost_frames() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let mut sink = new_sink(temporary.path().join("segment.mp4"), None);
    for lost_frames in [0, 1, u64::MAX] {
        let result = sink.discontinuity(ScreenDiscontinuity {
            session_ns: 42,
            lost_frames,
            code: "test".into(),
            message: "test".into(),
        });
        assert_eq!(result.is_ok(), lost_frames != 0);
    }
}

#[test]
fn finish_after_missing_format_is_idempotent_and_marks_sink_finalized() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let mut sink = new_sink(temporary.path().join("segment.mp4"), None);
    let error = sink.finish().expect_err("segment has no format");
    assert!(error.to_string().contains("received no format"));
    assert!(sink.finished);
    sink.finish().expect("repeated finish");
}

#[test]
fn cursor_sidecars_finalize_without_an_active_segment_and_report_storage_error() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let cursor_directory = temporary.path().join("cursor");
    let mut sink = new_sink(
        temporary.path().join("segment.mp4"),
        Some(cursor_directory.clone()),
    );
    sink.current_segment = None;
    sink.push_cursor(5, CursorSampleState::Unknown)
        .expect("unknown cursor");
    sink.finish().expect("cursor sidecars");
    assert!(cursor_directory.join("cursor.json").is_file());
    assert!(cursor_directory.join("telemetry.json").is_file());
    assert!(cursor_directory.join("shapes.json").is_file());

    let blocked = temporary.path().join("file-not-directory");
    fs::write(&blocked, b"occupied").expect("create blocking file");
    let mut sink = new_sink(temporary.path().join("another.mp4"), Some(blocked));
    sink.current_segment = None;
    let error = sink.finish().expect_err("cursor directory creation fails");
    assert_eq!(error.code(), "storage-error");
    assert!(sink.finished);
}
