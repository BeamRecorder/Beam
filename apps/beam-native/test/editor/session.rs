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
    let session = Session::new(Arc::new(EditorController::new().unwrap()));
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
    let session = Session::new(Arc::new(EditorController::new().unwrap()));
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
    let session = Session::new(Arc::new(EditorController::new().unwrap()));
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
