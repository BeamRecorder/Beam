#[cfg(unix)]
mod endpoint;
#[cfg(unix)]
mod ownership;
#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod windows;
use beam_editor_engine::{
    EditorController,
    broker::{Client, serve},
    domain::protocol::*,
    service::{EditorService, grants::GrantRegistry},
};
use std::sync::Arc;

#[test]
fn broker_uses_the_owner_service_and_releases_endpoint_on_drop() {
    let root = tempfile::tempdir().unwrap();
    let endpoint = beam_editor_engine::broker::endpoint_for(root.path()).unwrap();
    let service = Arc::new(EditorService::new(
        Arc::new(EditorController::new().unwrap()),
        Arc::new(GrantRegistry::default()),
    ));
    let broker = serve(endpoint.clone(), service.clone()).unwrap();
    let client = Client::connect(&endpoint).unwrap();
    assert!(matches!(
        client.request(Request::Schema).unwrap(),
        Response::Schema { .. }
    ));
    assert!(matches!(
        client
            .request(Request::Query {
                query: Query::Project
            })
            .unwrap(),
        Response::Error { .. }
    ));
    assert!(serve(endpoint.clone(), service).is_err());
    drop(broker);
    assert!(!beam_editor_engine::broker::token_file(&endpoint).exists());
}
#[test]
fn missing_or_empty_broker_token_is_an_explicit_failure() {
    let root = tempfile::tempdir().unwrap();
    let endpoint = beam_editor_engine::broker::endpoint_for(root.path()).unwrap();
    assert!(Client::connect(&endpoint).is_err());
    std::fs::write(beam_editor_engine::broker::token_file(&endpoint), b"").unwrap();
    assert!(Client::connect(&endpoint).is_err());
    std::fs::remove_file(beam_editor_engine::broker::token_file(&endpoint)).unwrap();
}
