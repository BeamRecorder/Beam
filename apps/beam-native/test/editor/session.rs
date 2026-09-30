use super::session::Session;
use beam_editor_engine::domain::protocol::{Query, Request, Response};
use beam_editor_engine::{
    EditorController,
    broker::{Client, endpoint_for},
};
use std::sync::Arc;

#[test]
fn native_owner_and_attached_clients_share_content_and_release_old_endpoints() {
    let root = tempfile::tempdir().unwrap();
    let session = Session::new(Arc::new(EditorController::new().unwrap()), None);
    let first = root.path().join("first");
    let snapshot = session.create(first.clone(), "First".into()).unwrap();
    let client = Client::connect(&endpoint_for(&first).unwrap()).unwrap();
    let Response::Project { project } = client
        .request(Request::Query {
            query: Query::Project,
        })
        .unwrap()
    else {
        panic!("project projection")
    };
    assert_eq!(project.id, snapshot.project.id);
    session
        .create(root.path().join("second"), "Second".into())
        .unwrap();
    assert!(
        client
            .request(Request::Query {
                query: Query::Project
            })
            .is_err()
    );
}
#[test]
fn native_open_failure_keeps_the_accepted_owner_connectable() {
    let root = tempfile::tempdir().unwrap();
    let session = Session::new(Arc::new(EditorController::new().unwrap()), None);
    let snapshot = session
        .create(root.path().join("good"), "Good".into())
        .unwrap();
    assert!(session.open(root.path().join("missing")).is_err());
    let client = Client::connect(&endpoint_for(&root.path().join("good")).unwrap()).unwrap();
    let Response::Project { project } = client
        .request(Request::Query {
            query: Query::Project,
        })
        .unwrap()
    else {
        panic!("project projection")
    };
    assert_eq!(project.id, snapshot.project.id);
}
#[test]
fn configured_grants_are_opaque_and_invalid_configuration_is_explicit() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("source.webm");
    std::fs::write(&source, b"owned source").unwrap();
    let session = Session::new(Arc::new(EditorController::new().unwrap()), None);
    session
        .configure([
            format!("--editor-source={}", source.display()),
            format!("--editor-destination={}", root.path().display()),
        ])
        .unwrap();
    let response = session
        .service
        .request(Request::Query {
            query: Query::Grants {
                offset: 0,
                limit: 256,
            },
        })
        .unwrap();
    let Response::Grants { page } = response else {
        panic!("grants")
    };
    assert_eq!(page.items.len(), 2);
    assert!(
        !serde_json::to_string(&page)
            .unwrap()
            .contains(&root.path().display().to_string())
    );
    assert!(
        session
            .configure(["--editor-source=/missing/source.webm".into()])
            .is_err()
    );
}

#[test]
fn saved_cursor_defaults_seed_new_projects_without_replacing_native_edits() {
    let root = tempfile::tempdir().unwrap();
    let mut cursor = beam_editor_engine::domain::recording::style_types::CursorStyle::default();
    cursor.size = 52.;
    cursor.motion.motion_blur = 0.7;
    let session = Session::new(
        Arc::new(EditorController::new().unwrap()),
        Some(cursor.clone()),
    );
    let path = root.path().join("project");
    let created = session.create(path.clone(), "Test".into()).unwrap();
    assert_eq!(created.project.recording_style.cursor, cursor);
    let mut profile = created.project.recording_style;
    profile.cursor.size = 64.;
    session
        .controller
        .edit(
            created.revision,
            beam_editor_engine::Edit::RecordingStyle {
                style: profile.clone(),
            },
        )
        .unwrap();
    session
        .create(root.path().join("other"), "Other".into())
        .unwrap();
    let opened = session.open(path).unwrap();
    assert_eq!(opened.project.recording_style, profile);
}
