#![allow(clippy::expect_used)]

use capture::{
    model::{ProjectId, SessionId},
    storage::{ManifestWriter, ProjectLayout},
};

use super::manifest;

#[test]
fn capture_writer_can_publish_an_intentionally_incomplete_final_session() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let project_id = ProjectId::new();
    let session_id = SessionId::new();
    let layout = ProjectLayout::new(temporary.path(), project_id).session(session_id);
    layout.create().expect("layout");
    let mut value = manifest(project_id, session_id);
    ManifestWriter::new(layout.clone())
        .finalize_with_completion(&mut value, false)
        .expect("failed final session");
    let stored: serde_json::Value =
        serde_json::from_slice(&std::fs::read(layout.manifest()).expect("final manifest"))
            .expect("JSON");
    assert_eq!(stored["completed"], false);
    assert!(!value.completed);
}
