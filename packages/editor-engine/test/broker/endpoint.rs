//! Endpoint identity and filesystem security survive long paths and aliases.
use beam_editor_engine::{
    EditorController,
    broker::{serve, token_file},
    domain::protocol::*,
    service::{EditorService, grants::GrantRegistry},
};
use std::os::unix::fs::PermissionsExt;
use std::sync::Arc;
fn service() -> Arc<EditorService> {
    Arc::new(EditorService::new(
        Arc::new(EditorController::new().unwrap()),
        Arc::new(GrantRegistry::default()),
    ))
}

#[test]
fn long_project_paths_aliases_and_distinct_roots_get_short_private_addresses() {
    use beam_editor_engine::broker::{Client, endpoint_for};
    use std::os::unix::fs::{MetadataExt, symlink};
    let root = tempfile::tempdir().unwrap();
    let project = root.path().join("a".repeat(180)).join("b".repeat(180));
    std::fs::create_dir_all(&project).unwrap();
    let alias = root.path().join("alias");
    symlink(&project, &alias).unwrap();
    let other = root.path().join("other");
    std::fs::create_dir(&other).unwrap();
    let endpoint = endpoint_for(&project).unwrap();
    assert!(endpoint.as_os_str().as_encoded_bytes().len() < 104);
    assert_eq!(endpoint, endpoint_for(&alias).unwrap());
    assert_ne!(endpoint, endpoint_for(&other).unwrap());
    let parent = endpoint.parent().unwrap();
    let metadata = std::fs::symlink_metadata(parent).unwrap();
    assert!(metadata.is_dir());
    assert_eq!(metadata.permissions().mode() & 0o7777, 0o700);
    assert_eq!(metadata.uid(), unsafe { libc::geteuid() });
    let broker = serve(endpoint.clone(), service()).unwrap();
    assert!(matches!(
        Client::connect(&endpoint)
            .unwrap()
            .request(Request::Schema)
            .unwrap(),
        Response::Schema { .. }
    ));
    assert!(serve(endpoint_for(&alias).unwrap(), service()).is_err());
    drop(broker);
    assert!(!endpoint.exists());
    assert!(!token_file(&endpoint).exists());
    assert!(endpoint_for(&root.path().join("missing")).is_err());
    let file = root.path().join("file");
    std::fs::write(&file, b"not a directory").unwrap();
    assert!(endpoint_for(&file).is_err());
}

#[test]
fn non_utf8_project_names_do_not_collide_after_lossy_display_conversion() {
    use std::os::unix::ffi::OsStringExt;
    let root = tempfile::tempdir().unwrap();
    let first = root
        .path()
        .join(std::ffi::OsString::from_vec(vec![b'p', 0x80]));
    let second = root
        .path()
        .join(std::ffi::OsString::from_vec(vec![b'p', 0x81]));
    std::fs::create_dir(&first).unwrap();
    std::fs::create_dir(&second).unwrap();
    assert_eq!(first.to_string_lossy(), second.to_string_lossy());
    assert_ne!(
        beam_editor_engine::broker::endpoint_for(&first).unwrap(),
        beam_editor_engine::broker::endpoint_for(&second).unwrap()
    );
}
