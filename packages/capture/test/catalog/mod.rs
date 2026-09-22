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
        display_id: None,
        capabilities: SourceCapabilities::default(),
    }
}

#[test]
fn incompatible_source_kinds_are_rejected() {
    let window = source("window:1", SourceKind::Window);
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        capabilities: CaptureCapabilities::default(),
        permissions: PermissionSnapshot::default(),
        diagnostics: Default::default(),
        limitations: Vec::new(),
        sources: vec![window.clone()],
    };
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: Some(ScreenSelection::Source {
            source_id: window.id,
        }),
        system_audio: None,
        cursor: CursorSelection::Disabled,
        recording: RecordingSettings::default(),
        failure_policy: FailurePolicy::FailFast,
        region: None,
        excluded_process_id: None,
        excluded_window_handles: vec![],
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
        diagnostics: Default::default(),
        limitations: Vec::new(),
        sources: vec![
            source("window:1", SourceKind::Window),
            source("display:1", SourceKind::Display),
        ],
    };
    assert_eq!(snapshot.by_kind(SourceKind::Window).count(), 1);
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
        diagnostics: Default::default(),
        limitations: Vec::new(),
        sources: vec![display.clone()],
    };
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: Some(ScreenSelection::Source {
            source_id: display.id,
        }),
        system_audio: None,
        cursor: CursorSelection::Separate {
            capture_clicks: true,
            capture_shortcuts: true,
            capture_shape: true,
        },
        recording: RecordingSettings::default(),
        failure_policy: FailurePolicy::FailFast,
        region: None,
        excluded_process_id: None,
        excluded_window_handles: vec![],
    };
    assert!(matches!(
        validate_request(&request, &snapshot),
        Err(capture::CaptureError::Unsupported(_))
    ));
}

#[test]
fn supported_cursor_shape_mode_is_accepted_by_runtime_capabilities() {
    let display = source("display:1", SourceKind::Display);
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        capabilities: CaptureCapabilities {
            display_capture: true,
            separate_cursor: true,
            cursor_shapes: true,
            ..CaptureCapabilities::default()
        },
        permissions: PermissionSnapshot::default(),
        diagnostics: Default::default(),
        limitations: Vec::new(),
        sources: vec![display.clone()],
    };
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: Some(ScreenSelection::Source {
            source_id: display.id,
        }),
        system_audio: None,
        cursor: CursorSelection::Separate {
            capture_clicks: false,
            capture_shortcuts: false,
            capture_shape: true,
        },
        recording: RecordingSettings::default(),
        failure_policy: FailurePolicy::FailFast,
        region: None,
        excluded_process_id: None,
        excluded_window_handles: vec![],
    };

    assert!(validate_request(&request, &snapshot).is_ok());
}

fn portal_request(kind: PortalSourceKind) -> CaptureRequest {
    CaptureRequest {
        project_id: ProjectId::new(),
        screen: Some(ScreenSelection::Portal {
            kind,
            restore_token: None,
        }),
        system_audio: None,
        cursor: CursorSelection::Disabled,
        recording: RecordingSettings::default(),
        failure_policy: FailurePolicy::FailFast,
        region: None,
        excluded_process_id: None,
        excluded_window_handles: vec![],
    }
}

#[test]
fn portal_kind_requires_the_matching_runtime_capability() {
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        capabilities: CaptureCapabilities {
            portal_selection: true,
            display_capture: true,
            window_capture: false,
            ..CaptureCapabilities::default()
        },
        permissions: PermissionSnapshot::default(),
        diagnostics: Default::default(),
        limitations: Vec::new(),
        sources: Vec::new(),
    };
    assert!(validate_request(&portal_request(PortalSourceKind::Monitor), &snapshot).is_ok());
    assert!(validate_request(&portal_request(PortalSourceKind::Window), &snapshot).is_err());
    assert!(
        validate_request(
            &portal_request(PortalSourceKind::MonitorOrWindow),
            &snapshot
        )
        .is_err()
    );
}

#[test]
fn linux_portal_probe_failures_are_advisory_until_capture_starts() {
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        capabilities: CaptureCapabilities::default(),
        permissions: PermissionSnapshot::default(),
        diagnostics: CaptureDiagnostics {
            platform: "linux".into(),
            linux: None,
        },
        limitations: Vec::new(),
        sources: Vec::new(),
    };

    assert!(validate_request(&portal_request(PortalSourceKind::Monitor), &snapshot).is_ok());
}

#[test]
fn combined_portal_kind_requires_both_monitor_and_window() {
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        capabilities: CaptureCapabilities {
            portal_selection: true,
            display_capture: true,
            window_capture: true,
            ..CaptureCapabilities::default()
        },
        permissions: PermissionSnapshot::default(),
        diagnostics: Default::default(),
        limitations: Vec::new(),
        sources: Vec::new(),
    };
    assert!(
        validate_request(
            &portal_request(PortalSourceKind::MonitorOrWindow),
            &snapshot
        )
        .is_ok()
    );
}
