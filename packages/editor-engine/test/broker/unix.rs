use beam_editor_engine::{
    EditorController,
    broker::{serve, token_file},
    domain::protocol::*,
    service::{EditorService, grants::GrantRegistry},
};
use std::{
    io::{BufRead, BufReader, Write},
    os::unix::{fs::PermissionsExt, net::UnixStream},
    sync::Arc,
};

fn service() -> Arc<EditorService> {
    Arc::new(EditorService::new(
        Arc::new(EditorController::new().unwrap()),
        Arc::new(GrantRegistry::default()),
    ))
}

#[test]
fn unsafe_parent_and_token_permissions_or_symlinks_are_rejected() {
    use beam_editor_engine::broker::Client;
    use std::os::unix::fs::symlink;
    let root = tempfile::tempdir().unwrap();
    std::fs::set_permissions(root.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    let open = root.path().join("open");
    std::fs::create_dir(&open).unwrap();
    std::fs::set_permissions(&open, std::fs::Permissions::from_mode(0o755)).unwrap();
    assert!(serve(open.join("owner.sock"), service()).is_err());
    assert!(!open.join("owner.sock").exists());
    let alias = root.path().join("alias");
    symlink(root.path(), &alias).unwrap();
    assert!(serve(alias.join("owner.sock"), service()).is_err());
    let endpoint = root.path().join("owner.sock");
    let broker = serve(endpoint.clone(), service()).unwrap();
    let token = token_file(&endpoint);
    std::fs::set_permissions(&token, std::fs::Permissions::from_mode(0o644)).unwrap();
    assert!(Client::connect(&endpoint).is_err());
    std::fs::set_permissions(&token, std::fs::Permissions::from_mode(0o600)).unwrap();
    let saved = root.path().join("saved-token");
    std::fs::rename(&token, &saved).unwrap();
    symlink(&saved, &token).unwrap();
    assert!(Client::connect(&endpoint).is_err());
    std::fs::remove_file(&token).unwrap();
    std::fs::rename(saved, &token).unwrap();
    std::fs::set_permissions(&endpoint, std::fs::Permissions::from_mode(0o666)).unwrap();
    assert!(Client::connect(&endpoint).is_err());
    drop(broker);
}
#[test]
fn local_socket_and_token_are_owner_only_and_invalid_token_cannot_query() {
    let root = tempfile::tempdir().unwrap();
    std::fs::set_permissions(root.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    let endpoint = root.path().join("owner.socket");
    let service = Arc::new(EditorService::new(
        Arc::new(EditorController::new().unwrap()),
        Arc::new(GrantRegistry::default()),
    ));
    let _broker = serve(endpoint.clone(), service).unwrap();
    assert_eq!(
        std::fs::metadata(&endpoint).unwrap().permissions().mode() & 0o777,
        0o600
    );
    assert_eq!(
        std::fs::metadata(token_file(&endpoint))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o600
    );
    let mut stream = UnixStream::connect(&endpoint).unwrap();
    let request = RequestEnvelope {
        api_version: 1,
        request_id: "unauthorized".into(),
        token: "wrong".into(),
        request: Request::Schema,
    };
    let mut bytes = serde_json::to_vec(&request).unwrap();
    bytes.push(b'\n');
    stream.write_all(&bytes).unwrap();
    let mut response = String::new();
    BufReader::new(stream).read_line(&mut response).unwrap();
    let response: ResponseEnvelope = serde_json::from_str(&response).unwrap();
    let Response::Error { error } = response.response else {
        panic!("expected auth rejection");
    };
    assert!(matches!(error.code, ErrorCode::Unauthorized));
}
