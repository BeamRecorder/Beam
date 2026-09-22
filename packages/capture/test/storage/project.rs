#![allow(clippy::expect_used)]

use capture::{
    model::{ProjectId, SessionId},
    storage::create_or_update_project,
};

#[test]
fn updating_an_existing_project_keeps_creation_time_and_deduplicates_sessions() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let project = ProjectId::new();
    let session = SessionId::new();
    let first =
        create_or_update_project(temporary.path(), project, session, "2026-01-01T00:00:00Z")
            .expect("create");
    let updated =
        create_or_update_project(temporary.path(), project, session, "2026-01-02T00:00:00Z")
            .expect("update");
    assert_eq!(first.name, updated.name);
    assert_eq!(updated.created_at_utc, "2026-01-01T00:00:00Z");
    assert_eq!(updated.updated_at_utc, "2026-01-02T00:00:00Z");
    assert_eq!(updated.sessions.len(), 1);
}
