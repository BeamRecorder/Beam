use base64::Engine;
use beam_editor_engine::{domain::protocol::ARTIFACT_CHUNK_BYTES, service::artifacts};
use std::{io::Write, sync::atomic::AtomicBool};
fn artifact(root: &std::path::Path) -> beam_editor_engine::domain::protocol::ArtifactInfo {
    artifacts::publish(
        root,
        uuid::Uuid::new_v4(),
        "frame.png".into(),
        "image/png",
        8,
        4,
        |file| {
            file.write_all(&[0, 1, 2, 3, 4, 5]).unwrap();
            Ok(())
        },
    )
    .unwrap()
}
#[test]
fn artifacts_publish_metadata_and_read_only_requested_chunks() {
    let root = tempfile::tempdir().unwrap();
    let info = artifact(root.path());
    assert_eq!(info.byte_length, 6);
    assert!(
        !serde_json::to_string(&info)
            .unwrap()
            .contains(root.path().to_str().unwrap())
    );
    let first = artifacts::read(root.path(), &info, 0, 4).unwrap();
    assert_eq!(first.next, Some(4));
    assert_eq!(
        base64::engine::general_purpose::STANDARD
            .decode(first.data_base64)
            .unwrap(),
        [0, 1, 2, 3]
    );
    let last = artifacts::read(root.path(), &info, 4, 4).unwrap();
    assert_eq!(last.next, None);
    assert_eq!(
        base64::engine::general_purpose::STANDARD
            .decode(last.data_base64)
            .unwrap(),
        [4, 5]
    );
    assert!(
        artifacts::read(root.path(), &info, 6, 1)
            .unwrap()
            .data_base64
            .is_empty()
    );
}
#[test]
fn invalid_reads_and_same_size_tampering_are_rejected() {
    let root = tempfile::tempdir().unwrap();
    let info = artifact(root.path());
    artifacts::read(root.path(), &info, 0, 1).unwrap();
    for (offset, length) in [(0, 0), (0, ARTIFACT_CHUNK_BYTES + 1), (7, 1), (u64::MAX, 1)] {
        assert!(artifacts::read(root.path(), &info, offset, length).is_err());
    }
    std::fs::write(
        root.path()
            .join(format!(".editor/artifacts/{}.bin", info.id)),
        [6, 5, 4, 3, 2, 1],
    )
    .unwrap();
    assert!(artifacts::read(root.path(), &info, 0, 1).is_err());
}
#[test]
fn publication_failure_preserves_no_partial_artifact_and_cancelled_capture_is_rejected() {
    let root = tempfile::tempdir().unwrap();
    assert!(
        artifacts::publish(
            root.path(),
            uuid::Uuid::new_v4(),
            "bad".into(),
            "application/octet-stream",
            0,
            0,
            |file| {
                file.write_all(b"partial").unwrap();
                Err(beam_editor_engine::EditorError::Invalid(
                    "writer failed".into(),
                ))
            }
        )
        .is_err()
    );
    assert_eq!(
        std::fs::read_dir(root.path().join(".editor/artifacts"))
            .unwrap()
            .count(),
        0
    );
    let source = root.path().join("source");
    std::fs::write(&source, b"source").unwrap();
    assert!(
        artifacts::capture(
            root.path(),
            uuid::Uuid::new_v4(),
            &source,
            "video/webm",
            64,
            64,
            &AtomicBool::new(true)
        )
        .is_err()
    );
    assert!(artifacts::version_cancellable(&source, Some(&AtomicBool::new(true))).is_err());
    assert!(artifacts::version(root.path()).is_err());
    assert!(artifacts::managed_directory(root.path(), "../../escape").is_err());
}
#[cfg(unix)]
#[test]
fn symlinks_never_expand_artifact_authority() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join(".editor")).unwrap();
    std::os::unix::fs::symlink(outside.path(), root.path().join(".editor/artifacts")).unwrap();
    assert!(artifacts::managed_directory(root.path(), "artifacts").is_err());
    let file = outside.path().join("secret");
    std::fs::write(&file, b"private").unwrap();
    let link = root.path().join("link");
    std::os::unix::fs::symlink(file, &link).unwrap();
    assert!(artifacts::version(&link).is_err());
}
