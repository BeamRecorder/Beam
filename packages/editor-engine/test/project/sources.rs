use beam_editor_engine::project::sources;

#[test]
fn legacy_sources_gain_real_identity_and_changed_bytes_are_rejected() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("media")).unwrap();
    let path = root.path().join("media/source.webm");
    std::fs::write(&path, b"original bytes").unwrap();
    let mut project = crate::fixtures::project();
    sources::hydrate(root.path(), &mut project).unwrap();
    assert_eq!(
        project.assets[0].identity,
        Some(sources::identity(&path).unwrap())
    );
    sources::verify(root.path(), &project.assets[0]).unwrap();
    sources::verify(root.path(), &project.assets[0]).unwrap();
    std::fs::write(path, b"replacement source bytes").unwrap();
    assert!(sources::verify(root.path(), &project.assets[0]).is_err());
}

#[test]
fn absent_legacy_media_cannot_be_assigned_a_fake_digest() {
    let root = tempfile::tempdir().unwrap();
    assert!(sources::hydrate(root.path(), &mut crate::fixtures::project()).is_err());
}
