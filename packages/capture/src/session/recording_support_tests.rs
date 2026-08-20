#![allow(clippy::expect_used)]

use crate::{
    model::{TrackFormat, TrackId, TrackKind, TrackMetadata, TrackMetrics, TrackStatus},
    screen::{PixelFormat, VideoFormat},
};

use super::{insufficient_disk_space_message, update_video_format};
use crate::CaptureError;

#[test]
fn insufficient_disk_space_message_uses_mb() {
    assert_eq!(
        insufficient_disk_space_message(401_031_168, 536_870_912),
        "insufficient disk space: 382 MB available, 512 MB required"
    );
}

#[test]
fn insufficient_disk_space_message_rounds_required_mb_up() {
    assert_eq!(
        insufficient_disk_space_message(1_048_576, 1_048_577),
        "insufficient disk space: 1 MB available, 2 MB required"
    );
}

#[test]
fn update_video_format_updates_video_dimensions_without_touching_event_tracks() {
    let mut tracks = vec![
        TrackMetadata {
            track_id: TrackId::new(),
            kind: TrackKind::Screen,
            source_id: None,
            format: TrackFormat::Video {
                codec: "h264".into(),
                width: 1280,
                height: 720,
                nominal_fps: 60,
            },
            segments: Vec::new(),
            metrics: TrackMetrics::default(),
            status: TrackStatus::Preparing,
            termination_reason: None,
        },
        TrackMetadata {
            track_id: TrackId::new(),
            kind: TrackKind::Cursor,
            source_id: None,
            format: TrackFormat::Events {
                format: "json".into(),
            },
            segments: Vec::new(),
            metrics: TrackMetrics::default(),
            status: TrackStatus::Preparing,
            termination_reason: None,
        },
    ];

    update_video_format(
        &mut tracks,
        TrackKind::Screen,
        VideoFormat {
            width: 1920,
            height: 1164,
            stride: 1920 * 4,
            pixel_format: PixelFormat::Bgra8,
        },
    );

    assert!(matches!(
        &tracks[0].format,
        TrackFormat::Video {
            codec,
            width: 1920,
            height: 1164,
            nominal_fps: 60,
        } if codec == "h264"
    ));
    assert!(matches!(
        &tracks[1].format,
        TrackFormat::Events { format } if format == "json"
    ));

    update_video_format(
        &mut tracks,
        TrackKind::Cursor,
        VideoFormat {
            width: 3072,
            height: 1920,
            stride: 3072 * 4,
            pixel_format: PixelFormat::Bgra8,
        },
    );
    assert!(matches!(
        &tracks[1].format,
        TrackFormat::Events { format } if format == "json"
    ));
}

#[test]
fn failed_cursor_track_writes_a_health_error_with_the_native_reason() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let project = crate::model::ProjectId::new();
    let session = crate::model::SessionId::new();
    let layout = crate::storage::ProjectLayout::new(temporary.path(), project).session(session);
    layout.create().expect("session layout");
    let track_id = TrackId::new();
    let reason = "macOS cursor worker stopped: CGEventCreate failed";
    let tracks = [TrackMetadata {
        track_id,
        kind: TrackKind::Cursor,
        source_id: None,
        format: TrackFormat::Events {
            format: "json".into(),
        },
        segments: Vec::new(),
        metrics: TrackMetrics {
            frames_received: 1,
            ..TrackMetrics::default()
        },
        status: TrackStatus::Failed,
        termination_reason: Some(reason.into()),
    }];

    super::write_health_snapshot(&layout, &tracks, 15_000_000).expect("write health snapshot");

    let lines = std::fs::read_to_string(layout.health()).expect("read health snapshot");
    let values = lines
        .lines()
        .map(|line| serde_json::from_str::<serde_json::Value>(line).expect("health JSON"))
        .collect::<Vec<_>>();
    assert_eq!(values.len(), 2);
    assert_eq!(values[1]["event"], "error");
    assert_eq!(values[1]["code"], "track-failed");
    assert_eq!(values[1]["trackId"], track_id.to_string());
    assert_eq!(values[1]["message"], reason);
}

fn cursor_track(status: TrackStatus) -> TrackMetadata {
    TrackMetadata {
        track_id: TrackId::new(),
        kind: TrackKind::Cursor,
        source_id: None,
        format: TrackFormat::Events {
            format: "json".into(),
        },
        segments: Vec::new(),
        metrics: TrackMetrics::default(),
        status,
        termination_reason: None,
    }
}

#[test]
fn native_cursor_error_marks_the_track_failed_with_its_reason() {
    let mut tracks = [cursor_track(TrackStatus::Recording)];
    let result = Err(CaptureError::Backend("CGEventCreate failed".into()));

    super::mark_track_failed(&mut tracks, TrackKind::Cursor, &result);

    assert_eq!(tracks[0].status, TrackStatus::Failed);
    assert_eq!(
        tracks[0].termination_reason.as_deref(),
        Some("backend error: CGEventCreate failed")
    );
}

#[test]
fn successful_cursor_stop_preserves_the_track_state() {
    let mut tracks = [cursor_track(TrackStatus::Recording)];

    super::mark_track_failed(&mut tracks, TrackKind::Cursor, &Ok(()));

    assert_eq!(tracks[0].status, TrackStatus::Recording);
    assert!(tracks[0].termination_reason.is_none());
}

#[test]
fn cursor_error_does_not_modify_an_unrelated_track() {
    let mut track = cursor_track(TrackStatus::Recording);
    track.kind = TrackKind::Screen;
    let mut tracks = [track];
    let result = Err(CaptureError::Backend("CGEventCreate failed".into()));

    super::mark_track_failed(&mut tracks, TrackKind::Cursor, &result);

    assert_eq!(tracks[0].status, TrackStatus::Recording);
    assert!(tracks[0].termination_reason.is_none());
}
