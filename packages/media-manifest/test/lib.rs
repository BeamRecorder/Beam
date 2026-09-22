#![allow(clippy::expect_used)]

use beam_media_manifest::{
    ManifestWriter, PermissionSnapshot, PlatformMetadata, ProjectId, ProjectLayout, SCHEMA_VERSION,
    SelectedSources, SessionId, SessionManifest,
};

#[test]
fn public_api_writes_a_v2_session_without_private_module_access() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let project_id = ProjectId::new();
    let session_id = SessionId::new();
    let layout = ProjectLayout::new(temporary.path(), project_id).session(session_id);
    layout.create().expect("layout");
    let mut manifest = SessionManifest {
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
    };
    let path = ManifestWriter::new(layout)
        .finalize(&mut manifest)
        .expect("write");
    assert!(path.is_file());
    assert!(manifest.completed);
}
