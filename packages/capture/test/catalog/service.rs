use capture::{
    CaptureError,
    catalog::{CatalogSnapshot, validate_request},
    model::{
        CaptureCapabilities, CaptureRequest, CursorSelection, FailurePolicy, PermissionSnapshot,
        PermissionState, PortalSourceKind, ProjectId, RecordingSettings, ScreenSelection,
    },
};

#[test]
fn denied_screen_permission_stops_an_otherwise_supported_request() {
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: Some(ScreenSelection::Portal {
            kind: PortalSourceKind::Monitor,
            restore_token: None,
        }),
        system_audio: None,
        cursor: CursorSelection::Disabled,
        recording: RecordingSettings::default(),
        failure_policy: FailurePolicy::FailFast,
        region: None,
        excluded_process_id: None,
        excluded_window_handles: Vec::new(),
    };
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        capabilities: CaptureCapabilities {
            portal_selection: true,
            display_capture: true,
            ..Default::default()
        },
        permissions: PermissionSnapshot {
            screen: Some(PermissionState::Denied),
            ..Default::default()
        },
        diagnostics: Default::default(),
        limitations: Vec::new(),
        sources: Vec::new(),
    };
    assert!(matches!(
        validate_request(&request, &snapshot),
        Err(CaptureError::PermissionDenied(_))
    ));
}
