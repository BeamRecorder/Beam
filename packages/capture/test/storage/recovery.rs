#![allow(clippy::expect_used)]

use capture::{model::*, storage::*};

use super::manifest;

#[test]
fn recovery_preserves_an_explicitly_failed_final_manifest() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let project = ProjectId::new();
    let session = SessionId::new();
    let layout = ProjectLayout::new(temporary.path(), project).session(session);
    layout.create().expect("layout");
    let mut stored = manifest(project, session);
    stored.completed = false;
    write_atomic(
        &layout.manifest(),
        &serde_json::to_vec(&stored).expect("JSON"),
    )
    .expect("final failed manifest");
    let recovered = recover_session(&layout).expect("recover");
    assert!(!recovered.manifest.completed);
    assert_eq!(recovered.manifest.session_id, session);
}
