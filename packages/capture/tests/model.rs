#![allow(clippy::expect_used)]

use std::str::FromStr;

use capture::model::*;

#[test]
fn identifiers_are_unique_and_roundtrip() {
    let first = ProjectId::new();
    let second = ProjectId::new();
    assert_ne!(first, second);
    assert_eq!(ProjectId::from_str(&first.to_string()).ok(), Some(first));
}

#[test]
fn request_json_roundtrip_and_defaults_are_stable() {
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: Some(ScreenSelection::Portal {
            kind: PortalSourceKind::MonitorOrWindow,
            restore_token: None,
        }),
        system_audio: Some(SystemAudioSelection::DefaultMix),
        microphone: None,
        cursor: CursorSelection::default(),
        recording: RecordingSettings::default(),
        failure_policy: FailurePolicy::ContinueWithoutOptionalTracks,
    };
    let json = serde_json::to_string(&request).expect("serialize request");
    let decoded: CaptureRequest = serde_json::from_str(&json).expect("deserialize request");
    assert_eq!(request, decoded);
    assert!(decoded.validate_basic().is_ok());
}

#[test]
fn cursor_without_screen_is_rejected() {
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: None,
        system_audio: None,
        microphone: None,
        cursor: CursorSelection::default(),
        recording: RecordingSettings::default(),
        failure_policy: FailurePolicy::FailFast,
    };
    assert!(request.validate_basic().is_err());
}

#[test]
fn manifest_schema_is_versioned_and_roundtrips() {
    let manifest = SessionManifest {
        schema_version: SCHEMA_VERSION,
        project_id: ProjectId::new(),
        session_id: SessionId::new(),
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        session_start_monotonic_ns: 0,
        duration_ns: 0,
        platform: PlatformMetadata {
            os: "test".into(),
            architecture: "test".into(),
            backend: "fake".into(),
        },
        selected_sources: SelectedSources {
            screen: None,
            system_audio: None,
            microphone: None,
            camera: None,
        },
        tracks: Vec::new(),
        permissions: PermissionSnapshot::default(),
        warnings: Vec::new(),
        completed: false,
    };
    let json = serde_json::to_value(&manifest).expect("serialize manifest");
    assert_eq!(json["schemaVersion"], SCHEMA_VERSION);
    assert_eq!(
        serde_json::from_value::<SessionManifest>(json).expect("deserialize manifest"),
        manifest
    );
}

#[test]
fn track_metrics_accept_manifests_created_before_camera_pipeline_metrics() {
    let metrics: TrackMetrics = serde_json::from_value(serde_json::json!({
        "framesReceived": 12,
        "framesDropped": 2,
        "samplesReceived": 0,
        "samplesDropped": 0,
        "interruptions": 1,
        "configurationChanges": 0
    }))
    .expect("deserialize legacy metrics");
    assert_eq!(metrics.frames_acquired, 0);
    assert_eq!(metrics.frames_encoded, 0);
    assert_eq!(metrics.frames_received, 12);
}
