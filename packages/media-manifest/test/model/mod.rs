#![allow(clippy::expect_used)]

use beam_media_manifest::{ProjectId, ProjectManifest, ProjectSession, SessionId};

#[test]
fn project_model_preserves_editor_extensions_and_sessions() {
    let project = ProjectManifest {
        schema_version: 2,
        project_id: ProjectId::new(),
        name: "Example".into(),
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        updated_at_utc: "2026-01-02T00:00:00Z".into(),
        sessions: vec![ProjectSession {
            session_id: SessionId::new(),
            relative_path: "session-a".into(),
        }],
        editor: Default::default(),
        extra: serde_json::from_str(r#"{"extension":{"enabled":true}}"#).expect("map"),
    };
    let json = serde_json::to_value(&project).expect("serialize");
    assert_eq!(json["extension"]["enabled"], true);
    assert_eq!(json["sessions"][0]["relativePath"], "session-a");
    assert_eq!(
        serde_json::from_value::<ProjectManifest>(json).expect("deserialize"),
        project
    );
}
