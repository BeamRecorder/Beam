use beam_editor_engine::{
    EditorController,
    broker::{Client, serve, token_file},
    domain::protocol::*,
    service::{EditorService, grants::GrantRegistry},
};
use std::{
    fs,
    os::unix::{
        fs::{MetadataExt, PermissionsExt, symlink},
        net::{UnixListener, UnixStream},
    },
    path::Path,
    sync::Arc,
};

fn service() -> Arc<EditorService> {
    Arc::new(EditorService::new(
        Arc::new(EditorController::new().unwrap()),
        Arc::new(GrantRegistry::default()),
    ))
}
fn private_root() -> tempfile::TempDir {
    let root = tempfile::tempdir().unwrap();
    fs::set_permissions(root.path(), fs::Permissions::from_mode(0o700)).unwrap();
    root
}
fn token(endpoint: &Path) {
    fs::write(token_file(endpoint), b"previous-owner-token").unwrap();
    fs::set_permissions(token_file(endpoint), fs::Permissions::from_mode(0o600)).unwrap();
}
fn listener(endpoint: &Path) -> UnixListener {
    let listener = UnixListener::bind(endpoint).unwrap();
    fs::set_permissions(endpoint, fs::Permissions::from_mode(0o600)).unwrap();
    listener
}

#[test]
fn abandoned_socket_and_token_are_recovered_with_a_fresh_session() {
    let root = private_root();
    let endpoint = root.path().join("owner.sock");
    let old_listener = listener(&endpoint);
    token(&endpoint);
    let old_client = Client::connect(&endpoint).unwrap();
    drop(old_listener);
    let owner = serve(endpoint.clone(), service()).unwrap();
    let client = Client::connect(&endpoint).unwrap();
    assert!(matches!(
        client.request(Request::Schema).unwrap(),
        Response::Schema { .. }
    ));
    let Response::Error { error } = old_client.request(Request::Schema).unwrap() else {
        panic!("old token remained authorized");
    };
    assert!(matches!(error.code, ErrorCode::Unauthorized));
    drop(owner);
    assert!(!endpoint.exists());
    assert!(!token_file(&endpoint).exists());
    assert!(endpoint.with_extension("lock").is_file());
}

#[test]
fn a_live_listener_without_a_lock_is_never_removed() {
    let root = private_root();
    let endpoint = root.path().join("legacy.sock");
    let _listener = listener(&endpoint);
    token(&endpoint);
    let inode = fs::symlink_metadata(&endpoint).unwrap().ino();
    assert!(serve(endpoint.clone(), service()).is_err());
    assert_eq!(fs::symlink_metadata(&endpoint).unwrap().ino(), inode);
    assert_eq!(
        fs::read(token_file(&endpoint)).unwrap(),
        b"previous-owner-token"
    );
    assert!(UnixStream::connect(&endpoint).is_ok());
    fs::remove_file(token_file(&endpoint)).unwrap();
    assert!(serve(endpoint.clone(), service()).is_err());
    assert_eq!(fs::symlink_metadata(&endpoint).unwrap().ino(), inode);
    assert!(!token_file(&endpoint).exists());
}

#[test]
fn lock_inode_is_retained_and_neither_truncated_nor_released_before_stop() {
    let root = private_root();
    let endpoint = root.path().join("owner.sock");
    let path = endpoint.with_extension("lock");
    fs::write(&path, b"keep-inode").unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
    let inode = fs::metadata(&path).unwrap().ino();
    let owner = serve(endpoint.clone(), service()).unwrap();
    let candidate = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&path)
        .unwrap();
    assert!(fs2::FileExt::try_lock_exclusive(&candidate).is_err());
    let old_token = fs::read(token_file(&endpoint)).unwrap();
    assert!(serve(endpoint.clone(), service()).is_err());
    assert_eq!(fs::read(token_file(&endpoint)).unwrap(), old_token);
    assert!(matches!(
        Client::connect(&endpoint)
            .unwrap()
            .request(Request::Schema)
            .unwrap(),
        Response::Schema { .. }
    ));
    drop(owner);
    fs2::FileExt::try_lock_exclusive(&candidate).unwrap();
    fs2::FileExt::unlock(&candidate).unwrap();
    let restarted = serve(endpoint, service()).unwrap();
    assert_eq!(fs::metadata(&path).unwrap().ino(), inode);
    assert_eq!(fs::read(&path).unwrap(), b"keep-inode");
    assert_eq!(
        fs::metadata(&path).unwrap().permissions().mode() & 0o7777,
        0o600
    );
    drop(restarted);
}

#[test]
fn orphan_token_is_recovered_without_needing_a_socket() {
    let root = private_root();
    let endpoint = root.path().join("owner.sock");
    token(&endpoint);
    let owner = serve(endpoint.clone(), service()).unwrap();
    assert_ne!(
        fs::read(token_file(&endpoint)).unwrap(),
        b"previous-owner-token"
    );
    assert!(Client::connect(&endpoint).is_ok());
    drop(owner);
}

#[test]
fn unsafe_recovery_candidates_are_preserved_and_rejected_before_removal() {
    let service = service();
    for candidate in [
        "socket-mode",
        "socket-file",
        "socket-symlink",
        "token-mode",
        "token-symlink",
        "lock-mode",
        "lock-symlink",
        "lock-hardlink",
        "lock-directory",
    ] {
        let root = private_root();
        let endpoint = root.path().join("owner.sock");
        drop(listener(&endpoint));
        token(&endpoint);
        let lock = endpoint.with_extension("lock");
        match candidate {
            "socket-mode" => {
                fs::set_permissions(&endpoint, fs::Permissions::from_mode(0o666)).unwrap()
            }
            "socket-file" => {
                fs::remove_file(&endpoint).unwrap();
                fs::write(&endpoint, b"preserve").unwrap();
            }
            "socket-symlink" => {
                fs::remove_file(&endpoint).unwrap();
                symlink(root.path().join("missing"), &endpoint).unwrap();
            }
            "token-mode" => {
                fs::set_permissions(token_file(&endpoint), fs::Permissions::from_mode(0o644))
                    .unwrap()
            }
            "token-symlink" => {
                fs::remove_file(token_file(&endpoint)).unwrap();
                symlink(root.path().join("missing"), token_file(&endpoint)).unwrap();
            }
            "lock-mode" => {
                fs::write(&lock, b"unsafe").unwrap();
                fs::set_permissions(&lock, fs::Permissions::from_mode(0o644)).unwrap();
            }
            "lock-symlink" => symlink(root.path().join("missing"), &lock).unwrap(),
            "lock-hardlink" => {
                fs::hard_link(token_file(&endpoint), &lock).unwrap();
            }
            "lock-directory" => fs::create_dir(&lock).unwrap(),
            _ => unreachable!(),
        }
        let inode = fs::symlink_metadata(&endpoint).unwrap().ino();
        let token_inode = fs::symlink_metadata(token_file(&endpoint)).unwrap().ino();
        assert!(
            serve(endpoint.clone(), service.clone()).is_err(),
            "{candidate}"
        );
        assert_eq!(
            fs::symlink_metadata(&endpoint).unwrap().ino(),
            inode,
            "{candidate}"
        );
        assert_eq!(
            fs::symlink_metadata(token_file(&endpoint)).unwrap().ino(),
            token_inode,
            "{candidate}"
        );
    }
}
