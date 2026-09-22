#![cfg(test)]
#![allow(clippy::expect_used)]

use super::ActiveRecordings;
#[cfg(target_os = "linux")]
use super::OpenContext;
use crate::session::StartGate;

#[test]
fn source_availability_override_and_start_gate_are_independent() {
    let mut recordings = ActiveRecordings::default();
    assert!(!recordings.has_screen());
    assert!(recordings.screen_available());
    assert!(recordings.system_audio_level().is_none());
    recordings.set_screen_availability_for_test(false);
    assert!(recordings.has_screen());
    assert!(!recordings.screen_available());

    let gate = StartGate::new();
    recordings.start(&gate, 123).expect("start empty recording");
    assert_eq!(gate.wait().expect("start time"), 123);
}

#[test]
fn stopping_empty_recordings_finalizes_open_segments_and_leaves_failed_tracks_untouched() {
    use crate::{
        model::{TrackFormat, TrackId, TrackKind, TrackMetadata, TrackMetrics, TrackStatus},
        storage::segment,
    };
    let track = |kind, status| TrackMetadata {
        track_id: TrackId::new(),
        kind,
        source_id: None,
        format: TrackFormat::Events {
            format: "json".into(),
        },
        segments: vec![segment("cursor/events.json".into(), 10)],
        metrics: TrackMetrics::default(),
        status,
        termination_reason: None,
    };
    let mut tracks = vec![
        track(TrackKind::Cursor, TrackStatus::Recording),
        track(TrackKind::Screen, TrackStatus::Paused),
        track(TrackKind::Camera, TrackStatus::Failed),
    ];
    ActiveRecordings::default()
        .stop(&mut tracks, 20)
        .expect("stop empty sources");
    assert_eq!(tracks[0].status, TrackStatus::Paused);
    assert!(tracks[0].segments[0].complete);
    assert_eq!(tracks[0].segments[0].end_ns, Some(20));
    assert!(tracks[1].segments[0].complete);
    assert!(!tracks[2].segments[0].complete);
}

#[cfg(target_os = "linux")]
#[test]
fn portal_pause_and_resume_require_an_active_screen_without_hardware() {
    use crate::{
        catalog::CatalogSnapshot,
        model::{CaptureRequest, CursorSelection, FailurePolicy, ProjectId},
    };
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: None,
        system_audio: None,
        cursor: CursorSelection::Disabled,
        recording: Default::default(),
        failure_policy: FailurePolicy::FailFast,
        region: None,
        excluded_process_id: None,
        excluded_window_handles: Vec::new(),
    };
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-09-22T00:00:00Z".into(),
        capabilities: Default::default(),
        permissions: Default::default(),
        diagnostics: Default::default(),
        limitations: Vec::new(),
        sources: Vec::new(),
    };
    let temporary = tempfile::tempdir().expect("temp dir");
    let layout = crate::storage::ProjectLayout::new(temporary.path(), request.project_id)
        .session(crate::model::SessionId::new());
    layout.create().expect("session layout");
    let gate = std::sync::Arc::new(StartGate::new());
    let mut tracks = Vec::new();
    let mut active = ActiveRecordings::default();
    active
        .open(OpenContext {
            request: &request,
            snapshot: &snapshot,
            layout: &layout,
            generation: 0,
            start_ns: 0,
            tracks: &mut tracks,
            start_gate: &gate,
        })
        .expect("empty open");
    assert!(tracks.is_empty());
    assert!(matches!(
        active.pause_portal(&mut tracks, 1),
        Err(crate::CaptureError::InvalidTransition { .. })
    ));
    assert!(matches!(
        active.resume_portal(OpenContext {
            request: &request,
            snapshot: &snapshot,
            layout: &layout,
            generation: 1,
            start_ns: 1,
            tracks: &mut tracks,
            start_gate: &gate,
        }),
        Err(crate::CaptureError::InvalidTransition { .. })
    ));
    active.stop(&mut tracks, 2).expect("empty stop");
}

#[test]
fn cancelled_start_gate_rejects_empty_recording_and_available_override_can_recover() {
    let mut recordings = ActiveRecordings::default();
    recordings.set_screen_availability_for_test(false);
    assert!(!recordings.screen_available());
    recordings.set_screen_availability_for_test(true);
    assert!(recordings.screen_available());
    let gate = StartGate::new();
    gate.cancel();
    assert!(recordings.start(&gate, 10).is_err());
}

#[test]
fn stopping_before_segment_start_preserves_incomplete_track_and_returns_error() {
    use crate::{
        model::{TrackFormat, TrackId, TrackKind, TrackMetadata, TrackMetrics, TrackStatus},
        storage::segment,
    };
    let mut tracks = vec![TrackMetadata {
        track_id: TrackId::new(),
        kind: TrackKind::Cursor,
        source_id: None,
        format: TrackFormat::Events {
            format: "json".into(),
        },
        segments: vec![segment("cursor/events.json".into(), 100)],
        metrics: TrackMetrics::default(),
        status: TrackStatus::Recording,
        termination_reason: None,
    }];
    assert!(matches!(
        ActiveRecordings::default().stop(&mut tracks, 99),
        Err(crate::CaptureError::InvalidConfiguration(_))
    ));
    assert!(!tracks[0].segments[0].complete);
    assert_eq!(tracks[0].status, TrackStatus::Recording);
}

#[test]
fn stopping_at_exact_segment_start_completes_only_open_active_tracks() {
    use crate::{
        model::{TrackFormat, TrackId, TrackKind, TrackMetadata, TrackMetrics, TrackStatus},
        storage::segment,
    };
    let track = |kind, status, start_ns| TrackMetadata {
        track_id: TrackId::new(),
        kind,
        source_id: None,
        format: TrackFormat::Events {
            format: "json".into(),
        },
        segments: vec![segment("events.json".into(), start_ns)],
        metrics: TrackMetrics::default(),
        status,
        termination_reason: None,
    };
    let mut tracks = vec![
        track(TrackKind::Cursor, TrackStatus::Recording, 50),
        track(TrackKind::Screen, TrackStatus::Paused, 50),
        track(TrackKind::Camera, TrackStatus::Failed, 50),
        track(TrackKind::SystemAudio, TrackStatus::Completed, 50),
    ];
    ActiveRecordings::default()
        .stop(&mut tracks, 50)
        .expect("stop at boundary");
    for track in &tracks[..2] {
        assert_eq!(track.status, TrackStatus::Paused);
        assert!(track.segments[0].complete);
        assert_eq!(track.segments[0].end_ns, Some(50));
    }
    for track in &tracks[2..] {
        assert!(!track.segments[0].complete);
    }
}

#[test]
fn already_released_start_gate_does_not_start_an_empty_recording() {
    let mut active = ActiveRecordings::default();
    let gate = StartGate::new();
    gate.release(1).expect("initial gate release");
    let error = active.start(&gate, 2).expect_err("second release");
    assert_eq!(error.code(), "invalid-transition");
    assert_eq!(gate.wait().expect("original time"), 1);
}

#[cfg(target_os = "linux")]
fn empty_open_fixture() -> (
    tempfile::TempDir,
    crate::model::CaptureRequest,
    crate::catalog::CatalogSnapshot,
    crate::storage::SessionLayout,
) {
    use crate::{
        catalog::CatalogSnapshot,
        model::{CaptureRequest, CursorSelection, FailurePolicy, ProjectId, SessionId},
        storage::ProjectLayout,
    };
    let temporary = tempfile::tempdir().expect("temp dir");
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: None,
        system_audio: None,
        cursor: CursorSelection::Disabled,
        recording: Default::default(),
        failure_policy: FailurePolicy::FailFast,
        region: None,
        excluded_process_id: None,
        excluded_window_handles: Vec::new(),
    };
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-09-22T00:00:00Z".into(),
        capabilities: Default::default(),
        permissions: Default::default(),
        diagnostics: Default::default(),
        limitations: Vec::new(),
        sources: Vec::new(),
    };
    let layout = ProjectLayout::new(temporary.path(), request.project_id).session(SessionId::new());
    layout.create().expect("layout");
    (temporary, request, snapshot, layout)
}

#[cfg(target_os = "linux")]
#[test]
fn open_rejects_invalid_audio_queue_before_hardware_and_leaves_no_tracks() {
    use crate::model::SystemAudioSelection;
    let (_temporary, mut request, snapshot, layout) = empty_open_fixture();
    request.system_audio = Some(SystemAudioSelection::DefaultOutput);
    request.recording.queue_capacity = 0;
    let gate = std::sync::Arc::new(StartGate::new());
    let mut tracks = Vec::new();
    let error = ActiveRecordings::default()
        .open(OpenContext {
            request: &request,
            snapshot: &snapshot,
            layout: &layout,
            generation: 1,
            start_ns: 0,
            tracks: &mut tracks,
            start_gate: &gate,
        })
        .expect_err("invalid audio capacity");
    assert_eq!(error.code(), "invalid-configuration");
    assert!(tracks.is_empty());
}

#[cfg(target_os = "linux")]
#[test]
fn open_rejects_non_portal_screen_before_hardware_and_leaves_no_tracks() {
    use crate::model::{ScreenSelection, SourceId};
    let (_temporary, mut request, snapshot, layout) = empty_open_fixture();
    request.screen = Some(ScreenSelection::Source {
        source_id: SourceId::new("display:test").expect("source"),
    });
    let gate = std::sync::Arc::new(StartGate::new());
    let mut tracks = Vec::new();
    let error = ActiveRecordings::default()
        .open(OpenContext {
            request: &request,
            snapshot: &snapshot,
            layout: &layout,
            generation: 1,
            start_ns: 0,
            tracks: &mut tracks,
            start_gate: &gate,
        })
        .expect_err("non Portal source");
    assert_eq!(error.code(), "unsupported-operation");
    assert!(tracks.is_empty());
}
