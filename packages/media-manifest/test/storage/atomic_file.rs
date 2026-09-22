#![allow(clippy::expect_used)]

use beam_media_manifest::{ManifestError, write_atomic};

#[test]
fn stale_temporary_write_is_recovered() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let target = temporary.path().join("manifest.json");
    let stale = temporary.path().join("manifest.json.tmp");
    std::fs::write(&stale, b"truncated").expect("stale file");
    write_atomic(&target, b"complete").expect("atomic write");
    assert_eq!(std::fs::read(target).expect("read"), b"complete");
    assert!(!stale.exists());
}

#[test]
fn missing_parent_directory_leaves_no_published_manifest() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let target = temporary.path().join("missing").join("manifest.json");
    assert!(matches!(
        write_atomic(&target, b"data"),
        Err(ManifestError::Storage { .. })
    ));
    assert!(!target.exists());
    assert!(!target.with_file_name("manifest.json.tmp").exists());
}

#[test]
fn failed_publication_removes_the_temporary_file() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let target = temporary.path().join("manifest.json");
    std::fs::create_dir(&target).expect("block file publication");
    assert!(matches!(
        write_atomic(&target, b"data"),
        Err(ManifestError::Storage { .. })
    ));
    assert!(target.is_dir());
    assert!(!target.with_file_name("manifest.json.tmp").exists());
}

#[test]
fn atomic_replacement_publishes_the_complete_new_value() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let target = temporary.path().join("manifest.json");
    write_atomic(&target, b"first").expect("first write");
    write_atomic(&target, b"replacement").expect("replacement");
    assert_eq!(std::fs::read(target).expect("read"), b"replacement");
}
