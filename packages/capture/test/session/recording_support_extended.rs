#![cfg(test)]
#![allow(clippy::expect_used)]

use super::cursor_track;
use crate::session::recording_support as support;
use crate::{
    CaptureError,
    model::{TrackFormat, TrackKind, TrackMetadata, TrackStatus},
};

#[test]
fn first_recorded_error_wins_and_success_does_not_replace_it() {
    let mut first = None;
    support::record_result(Ok(()), &mut first);
    assert!(first.is_none());
    support::record_result(Err(CaptureError::Backend("first".into())), &mut first);
    support::record_result(Err(CaptureError::Backend("second".into())), &mut first);
    assert!(
        first
            .as_ref()
            .is_some_and(|error| error.to_string().contains("first"))
    );
}

#[test]
fn track_creation_segments_and_metrics_cover_all_track_directories() {
    let mut tracks = Vec::new();
    let source = crate::model::SourceId::new("portal:monitor").expect("source ID");
    support::add_portal_screen_track(&mut tracks, source.clone(), "h264".into(), 1280, 720, 30);
    support::add_system_audio_track(&mut tracks, source, 48_000, 2);
    for kind in [TrackKind::Screen, TrackKind::SystemAudio] {
        support::add_segment(&mut tracks, kind, 12, "mkv", 123).expect("track segment");
        let track = support::track_for(&tracks, kind).expect("track by kind");
        assert_eq!(track.status, TrackStatus::Recording);
        assert_eq!(track.segments.len(), 1);
        assert!(track.segments[0].path.contains("segment-0012.mkv"));
    }
    assert!(support::add_segment(&mut tracks, TrackKind::Microphone, 0, "wav", 0).is_err());
    support::update_video_metrics(&mut tracks, TrackKind::Screen, 4, 2);
    let screen = support::track_for(&tracks, TrackKind::Screen).expect("screen track");
    assert_eq!(screen.metrics.frames_acquired, 4);
    assert_eq!(screen.metrics.frames_encoded, 4);
    assert_eq!(screen.metrics.frames_received, 4);
    assert_eq!(screen.metrics.frames_dropped, 2);
    support::update_video_metrics(&mut tracks, TrackKind::Screen, 3, 1);
    assert_eq!(tracks[0].metrics.frames_received, 7);
    assert_eq!(tracks[0].metrics.frames_dropped, 3);
    assert!(support::track_for(&tracks, TrackKind::Camera).is_none());
}

#[test]
fn track_segment_paths_use_stable_kind_directories() {
    let temporary = tempfile::tempdir().expect("temp dir");
    let layout =
        crate::storage::ProjectLayout::new(temporary.path(), crate::model::ProjectId::new())
            .session(crate::model::SessionId::new());
    for (kind, directory) in [
        (TrackKind::Screen, "screen"),
        (TrackKind::SystemAudio, "system-audio"),
        (TrackKind::Microphone, "microphone"),
        (TrackKind::Camera, "camera"),
        (TrackKind::Cursor, "cursor"),
    ] {
        let path = support::segment_path(&layout, kind, 7, "jsonl");
        assert!(path.ends_with(format!("{directory}/segment-0007.jsonl")));
    }
}

#[test]
fn portal_source_ids_and_platform_backend_match_the_shared_contract() {
    use crate::model::PortalSourceKind;
    for (kind, expected) in [
        (PortalSourceKind::Monitor, "portal:monitor"),
        (PortalSourceKind::Window, "portal:window"),
        (
            PortalSourceKind::MonitorOrWindow,
            "portal:monitor-or-window",
        ),
    ] {
        assert_eq!(
            support::portal_source_id(&kind)
                .expect("source ID")
                .as_str(),
            expected
        );
    }
    assert_eq!(
        support::system_audio_source_id()
            .expect("source ID")
            .as_str(),
        "system-audio:default-output"
    );
    #[cfg(target_os = "linux")]
    assert_eq!(support::platform_backend(), "xdg-portal-pipewire");
    #[cfg(target_os = "macos")]
    assert_eq!(support::platform_backend(), "screen-capture-kit");
    #[cfg(windows)]
    assert_eq!(support::platform_backend(), "windows-graphics-capture");
}

#[test]
fn sufficient_disk_space_and_utc_timestamp_are_available_without_hardware() {
    let temporary = tempfile::tempdir().expect("temp dir");
    support::ensure_free_space(temporary.path(), 0).expect("zero minimum");
    let timestamp = support::now_utc().expect("UTC timestamp");
    assert!(timestamp.ends_with('Z'));
    let invalid_root = temporary.path().join("regular-file");
    std::fs::write(&invalid_root, b"occupied").expect("occupy path");
    assert!(support::ensure_free_space(&invalid_root, 0).is_err());
}

#[test]
fn timing_anchors_use_video_frames_audio_frames_and_event_positions() {
    let temporary = tempfile::tempdir().expect("temp dir");
    let layout =
        crate::storage::ProjectLayout::new(temporary.path(), crate::model::ProjectId::new())
            .session(crate::model::SessionId::new());
    layout.create().expect("session layout");
    let mut video = cursor_track(TrackStatus::Recording);
    video.kind = TrackKind::Screen;
    video.format = TrackFormat::Video {
        codec: "h264".into(),
        width: 2,
        height: 2,
        nominal_fps: 0,
    };
    video.metrics.frames_received = 37;
    let mut audio = cursor_track(TrackStatus::Recording);
    audio.kind = TrackKind::SystemAudio;
    audio.format = TrackFormat::Audio {
        sample_format: "f32le".into(),
        sample_rate: 0,
        channels: 2,
    };
    audio.metrics.samples_received = 101;
    let mut events = cursor_track(TrackStatus::Recording);
    events.metrics.frames_received = 8;
    let failed = cursor_track(TrackStatus::Failed);

    support::write_timing_anchors(&layout, &[video, audio, events, failed], 777)
        .expect("write timing anchors");
    let lines = std::fs::read_to_string(layout.timing()).expect("read anchors");
    let values = lines
        .lines()
        .map(|line| serde_json::from_str::<serde_json::Value>(line).expect("anchor JSON"))
        .collect::<Vec<_>>();
    assert_eq!(values.len(), 3);
    assert_eq!(values[0]["nativePosition"], 37);
    assert_eq!(values[0]["nativeRate"], 1);
    assert_eq!(values[1]["nativePosition"], 50);
    assert_eq!(values[1]["nativeRate"], 1);
    assert_eq!(values[2]["nativePosition"], 8);
    assert_eq!(values[2]["nativeRate"], 1_000_000_000);
    assert!(values.iter().all(|value| value["sessionNs"] == 777));
}

#[test]
fn checkpoint_tracks_persists_each_track_and_append_jsonl_preserves_lines() {
    let temporary = tempfile::tempdir().expect("temp dir");
    let layout =
        crate::storage::ProjectLayout::new(temporary.path(), crate::model::ProjectId::new())
            .session(crate::model::SessionId::new());
    layout.create().expect("session layout");
    let mut screen = cursor_track(TrackStatus::Recording);
    screen.kind = TrackKind::Screen;
    let cursor = cursor_track(TrackStatus::Recording);
    support::checkpoint_tracks(&layout, &[screen.clone(), cursor.clone()]).expect("checkpoint");
    let screen_saved: TrackMetadata = serde_json::from_slice(
        &std::fs::read(layout.track_dir(TrackKind::Screen).join("track.json"))
            .expect("screen JSON"),
    )
    .expect("screen track");
    let cursor_saved: TrackMetadata = serde_json::from_slice(
        &std::fs::read(layout.track_dir(TrackKind::Cursor).join("track.json"))
            .expect("cursor JSON"),
    )
    .expect("cursor track");
    assert_eq!(screen_saved.track_id, screen.track_id);
    assert_eq!(cursor_saved.track_id, cursor.track_id);

    let path = temporary.path().join("events.jsonl");
    support::append_jsonl(&path, &serde_json::json!({"order": 1})).expect("first line");
    support::append_jsonl(&path, &serde_json::json!({"order": 2})).expect("second line");
    assert_eq!(
        std::fs::read_to_string(path)
            .expect("read JSONL")
            .lines()
            .count(),
        2
    );
}

#[test]
fn append_jsonl_and_checkpoint_report_unwritable_paths() {
    let temporary = tempfile::tempdir().expect("temp dir");
    assert!(support::append_jsonl(temporary.path(), &serde_json::json!({})).is_err());
    let layout =
        crate::storage::ProjectLayout::new(temporary.path(), crate::model::ProjectId::new())
            .session(crate::model::SessionId::new());
    assert!(support::checkpoint_tracks(&layout, &[cursor_track(TrackStatus::Recording)]).is_err());
}

fn screen_source() -> crate::model::SourceDescriptor {
    use crate::model::{MediaFormat, SourceCapabilities, SourceKind, SourceSelectionMode};
    crate::model::SourceDescriptor {
        id: crate::model::SourceId::new("display-1").expect("source ID"),
        kind: SourceKind::Display,
        label: "Fixture display".into(),
        is_default: true,
        selection_mode: SourceSelectionMode::Direct,
        display_id: None,
        capabilities: SourceCapabilities {
            formats: vec![
                MediaFormat::Audio {
                    sample_rate: 48_000,
                    channels: 2,
                    sample_format: "f32le".into(),
                },
                MediaFormat::Video {
                    width: 1920,
                    height: 1080,
                    fps: 30,
                    pixel_format: Some("bgra".into()),
                },
            ],
            supports_cursor_exclusion: true,
        },
    }
}

fn snapshot() -> crate::catalog::CatalogSnapshot {
    crate::catalog::CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-09-22T00:00:00Z".into(),
        capabilities: Default::default(),
        permissions: Default::default(),
        diagnostics: Default::default(),
        limitations: Vec::new(),
        sources: vec![screen_source()],
    }
}

fn request() -> crate::model::CaptureRequest {
    use crate::model::{
        CaptureRequest, CursorSelection, FailurePolicy, ProjectId, ScreenSelection,
    };
    CaptureRequest {
        project_id: ProjectId::new(),
        screen: Some(ScreenSelection::Source {
            source_id: screen_source().id,
        }),
        system_audio: None,
        cursor: CursorSelection::Disabled,
        recording: Default::default(),
        failure_policy: FailurePolicy::FailFast,
        region: None,
        excluded_process_id: None,
        excluded_window_handles: Vec::new(),
    }
}

#[test]
fn metadata_uses_first_video_format_and_applies_crop_and_cursor_selection() {
    use crate::model::{CursorSelection, ScreenRegion};
    let mut request = request();
    request.region = Some(ScreenRegion {
        x: 0.25,
        y: 0.0,
        width: 0.5,
        height: 1.0,
    });
    request.cursor = CursorSelection::Separate {
        capture_clicks: true,
        capture_shortcuts: false,
        capture_shape: false,
    };
    let tracks = support::track_metadata(&request, &snapshot()).expect("track metadata");
    assert_eq!(tracks.len(), 2);
    assert!(matches!(
        tracks[0].format,
        TrackFormat::Video {
            width: 960,
            height: 1080,
            nominal_fps: 30,
            ..
        }
    ));
    assert_eq!(tracks[0].status, TrackStatus::Preparing);
    assert_eq!(
        tracks[0].source_id.as_ref(),
        request.screen.as_ref().and_then(|screen| match screen {
            crate::model::ScreenSelection::Source { source_id } => Some(source_id),
            _ => None,
        })
    );
    assert_eq!(tracks[1].kind, TrackKind::Cursor);
    assert!(matches!(tracks[1].format, TrackFormat::Events { .. }));
}

#[test]
fn missing_source_and_invalid_crop_fail_before_track_creation() {
    use crate::model::ScreenRegion;
    let request = request();
    assert!(matches!(
        support::track_metadata(
            &request,
            &crate::catalog::CatalogSnapshot {
                sources: Vec::new(),
                ..snapshot()
            }
        ),
        Err(CaptureError::SourceNotFound(_))
    ));
    let mut request = request;
    request.region = Some(ScreenRegion {
        x: 0.9,
        y: 0.0,
        width: 0.2,
        height: 1.0,
    });
    assert!(support::track_metadata(&request, &snapshot()).is_err());
}

#[test]
fn selected_sources_preserve_source_portal_and_optional_audio() {
    use crate::model::{PortalSourceKind, ScreenSelection, SystemAudioSelection};
    let mut request = request();
    let direct = support::selected_sources(&request, &snapshot());
    assert_eq!(direct.screen, Some(screen_source().id));
    assert!(direct.system_audio.is_none());
    request.screen = Some(ScreenSelection::Portal {
        kind: PortalSourceKind::Window,
        restore_token: None,
    });
    request.system_audio = Some(SystemAudioSelection::DefaultOutput);
    let portal = support::selected_sources(&request, &snapshot());
    assert_eq!(
        portal.screen.as_ref().map(crate::model::SourceId::as_str),
        Some("portal:window")
    );
    assert_eq!(
        portal
            .system_audio
            .as_ref()
            .map(crate::model::SourceId::as_str),
        Some("system-audio:default-output")
    );
    assert!(portal.microphone.is_none());
    assert!(portal.camera.is_none());
}

#[test]
fn video_format_falls_back_when_catalog_only_advertises_audio() {
    let mut source = screen_source();
    source
        .capabilities
        .formats
        .retain(|format| matches!(format, crate::model::MediaFormat::Audio { .. }));
    assert_eq!(support::video_format(&source, 75), (0, 0, 75));
    source.capabilities.formats.clear();
    assert_eq!(support::video_format(&source, 24), (0, 0, 24));
}

#[test]
fn no_screen_or_audio_selects_no_sources_or_metadata() {
    let mut request = request();
    request.screen = None;
    request.cursor = crate::model::CursorSelection::Disabled;
    let selected = support::selected_sources(&request, &snapshot());
    assert!(selected.screen.is_none());
    assert!(selected.system_audio.is_none());
    assert!(
        support::track_metadata(&request, &snapshot())
            .expect("no tracks")
            .is_empty()
    );
}

#[test]
fn disk_space_minimum_above_capacity_reports_configuration_failure() {
    let temporary = tempfile::tempdir().expect("temp dir");
    let error = support::ensure_free_space(temporary.path(), u64::MAX).err();
    assert!(matches!(error, Some(CaptureError::InvalidConfiguration(_))));
}

#[test]
fn invalid_transition_preserves_from_state_and_requested_target() {
    let error = support::invalid_transition(crate::session::SessionState::Paused, "Recording");
    assert!(
        matches!(error, CaptureError::InvalidTransition { from, to } if from == "Paused" && to == "Recording")
    );
}
