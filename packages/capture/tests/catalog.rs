#![allow(clippy::expect_used)]

use capture::{
    catalog::{CatalogSnapshot, validate_request},
    model::*,
};

fn source(id: &str, kind: SourceKind) -> SourceDescriptor {
    SourceDescriptor {
        id: SourceId::new(id).expect("valid source id"),
        kind,
        label: id.into(),
        is_default: false,
        selection_mode: SourceSelectionMode::Direct,
        capabilities: SourceCapabilities::default(),
    }
}

#[test]
fn incompatible_source_kinds_are_rejected() {
    let microphone = source("microphone:1", SourceKind::Microphone);
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        capabilities: CaptureCapabilities::default(),
        permissions: PermissionSnapshot::default(),
        limitations: Vec::new(),
        sources: vec![microphone.clone()],
    };
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: Some(ScreenSelection::Source {
            source_id: microphone.id,
        }),
        system_audio: None,
        microphone: None,
        cursor: CursorSelection::Disabled,
        recording: RecordingSettings::default(),
        failure_policy: FailurePolicy::FailFast,
    };
    assert!(validate_request(&request, &snapshot).is_err());
}

#[test]
fn snapshot_filters_sources_by_kind() {
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        capabilities: CaptureCapabilities::default(),
        permissions: PermissionSnapshot::default(),
        limitations: Vec::new(),
        sources: vec![
            source("mic:1", SourceKind::Microphone),
            source("display:1", SourceKind::Display),
        ],
    };
    assert_eq!(snapshot.by_kind(SourceKind::Microphone).count(), 1);
}

#[test]
fn unsupported_cursor_mode_is_rejected_by_runtime_capabilities() {
    let display = source("display:1", SourceKind::Display);
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        capabilities: CaptureCapabilities {
            display_capture: true,
            separate_cursor: true,
            cursor_clicks: true,
            cursor_shapes: false,
            ..CaptureCapabilities::default()
        },
        permissions: PermissionSnapshot::default(),
        limitations: Vec::new(),
        sources: vec![display.clone()],
    };
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: Some(ScreenSelection::Source {
            source_id: display.id,
        }),
        system_audio: None,
        microphone: None,
        cursor: CursorSelection::Separate {
            capture_clicks: true,
            capture_shape: true,
        },
        recording: RecordingSettings::default(),
        failure_policy: FailurePolicy::FailFast,
    };
    assert!(matches!(
        validate_request(&request, &snapshot),
        Err(capture::CaptureError::Unsupported(_))
    ));
}

#[test]
fn denied_permission_is_reported_before_capture() {
    let microphone = source("mic:1", SourceKind::Microphone);
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        capabilities: CaptureCapabilities {
            microphone: true,
            ..CaptureCapabilities::default()
        },
        permissions: PermissionSnapshot {
            microphone: Some(PermissionState::Denied),
            ..PermissionSnapshot::default()
        },
        limitations: Vec::new(),
        sources: vec![microphone.clone()],
    };
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: None,
        system_audio: None,
        microphone: Some(MicrophoneSelection {
            source_id: microphone.id,
            preferred_sample_rate: None,
            preferred_channels: None,
        }),
        cursor: CursorSelection::Disabled,
        recording: RecordingSettings::default(),
        failure_policy: FailurePolicy::FailFast,
    };
    assert!(matches!(
        validate_request(&request, &snapshot),
        Err(capture::CaptureError::PermissionDenied(_))
    ));
}
