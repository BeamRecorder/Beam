use beam_media_manifest::{
    PermissionSnapshot, PlatformMetadata, ProjectId, SCHEMA_VERSION, SelectedSources, SessionId,
    SessionManifest,
};

pub fn sample_manifest(project_id: ProjectId, session_id: SessionId) -> SessionManifest {
    SessionManifest {
        cursor_mode: Default::default(),
        schema_version: SCHEMA_VERSION,
        project_id,
        session_id,
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        session_start_monotonic_ns: 0,
        duration_ns: 0,
        platform: PlatformMetadata {
            os: "linux".into(),
            architecture: "x86_64".into(),
            backend: "test".into(),
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
    }
}
