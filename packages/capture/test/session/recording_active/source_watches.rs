#![cfg(test)]
#![allow(clippy::expect_used)]

use super::source_watches;
use crate::{
    catalog::CatalogSnapshot,
    model::{
        CaptureCapabilities, CaptureRequest, CursorSelection, FailurePolicy, PermissionSnapshot,
        ProjectId, RecordingSettings,
    },
};

#[test]
fn no_selected_screen_produces_no_source_watch() {
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: None,
        system_audio: None,
        cursor: CursorSelection::Disabled,
        recording: RecordingSettings::default(),
        failure_policy: FailurePolicy::FailFast,
        region: None,
        excluded_process_id: None,
        excluded_window_handles: vec![],
    };
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: String::new(),
        capabilities: CaptureCapabilities::default(),
        permissions: PermissionSnapshot::default(),
        diagnostics: Default::default(),
        limitations: Vec::new(),
        sources: Vec::new(),
    };
    assert!(source_watches(&request, &snapshot, &[]).is_empty());
}

#[test]
fn selected_source_requires_matching_track_and_catalog_descriptor() {
    use crate::model::{
        SourceCapabilities, SourceDescriptor, SourceId, SourceKind, SourceSelectionMode,
        TrackFormat, TrackId, TrackKind, TrackMetadata, TrackMetrics, TrackStatus,
    };

    let source_id = SourceId::new("display:test").expect("source id");
    let source = SourceDescriptor {
        id: source_id.clone(),
        kind: SourceKind::Display,
        label: "Test display".into(),
        is_default: true,
        selection_mode: SourceSelectionMode::Direct,
        display_id: None,
        capabilities: SourceCapabilities::default(),
    };
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: Some(crate::model::ScreenSelection::Source {
            source_id: source_id.clone(),
        }),
        system_audio: None,
        cursor: CursorSelection::Disabled,
        recording: RecordingSettings::default(),
        failure_policy: FailurePolicy::FailFast,
        region: None,
        excluded_process_id: None,
        excluded_window_handles: vec![],
    };
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: String::new(),
        capabilities: CaptureCapabilities::default(),
        permissions: PermissionSnapshot::default(),
        diagnostics: Default::default(),
        limitations: Vec::new(),
        sources: vec![source],
    };
    let track = TrackMetadata {
        track_id: TrackId::new(),
        kind: TrackKind::Screen,
        source_id: Some(source_id),
        format: TrackFormat::Video {
            codec: "h264".into(),
            width: 1920,
            height: 1080,
            nominal_fps: 30,
        },
        segments: vec![],
        metrics: TrackMetrics::default(),
        status: TrackStatus::Recording,
        termination_reason: None,
    };
    assert!(source_watches(&request, &snapshot, &[]).is_empty());
    assert!(
        source_watches(
            &request,
            &CatalogSnapshot {
                sources: vec![],
                ..snapshot.clone()
            },
            std::slice::from_ref(&track)
        )
        .is_empty()
    );
    assert_eq!(source_watches(&request, &snapshot, &[track]).len(), 1);
}
