use beam_editor_domain::{
    Document, Edit, Project,
    project::{
        store::{ProjectStore, read_document},
        types::DOCUMENT_FILE,
    },
    timeline::history,
};
#[test]
fn exclusive_lock_releases_when_the_editor_closes() {
    let root = tempfile::tempdir().unwrap();
    let store = ProjectStore::lock(root.path()).unwrap();
    assert!(ProjectStore::lock(root.path()).is_err());
    drop(store);
    assert!(ProjectStore::lock(root.path()).is_ok());
}
#[test]
fn current_and_history_round_trip_with_a_valid_recovery_checkpoint() {
    let root = tempfile::tempdir().unwrap();
    let store = ProjectStore::lock(root.path()).unwrap();
    let original = Document::new(Project::new("First".into()));
    store.write(&original).unwrap();
    let next = history::edited(
        &original,
        &Edit::Rename {
            name: "Second".into(),
        },
    )
    .unwrap();
    store.write(&next).unwrap();
    assert_eq!(store.read().unwrap(), (next, false));
    let path = root.path().join(DOCUMENT_FILE);
    std::fs::write(&path, b"{incomplete").unwrap();
    assert_eq!(store.read().unwrap(), (original, true));
    assert_eq!(std::fs::read(path).unwrap(), b"{incomplete");
}
#[test]
fn invalid_write_never_replaces_last_valid_document_and_corruption_is_explicit() {
    let root = tempfile::tempdir().unwrap();
    let store = ProjectStore::lock(root.path()).unwrap();
    let mut value = Document::new(Project::new("Valid".into()));
    store.write(&value).unwrap();
    let bytes = std::fs::read(root.path().join(DOCUMENT_FILE)).unwrap();
    value.project.name.clear();
    assert!(store.write(&value).is_err());
    assert_eq!(
        std::fs::read(root.path().join(DOCUMENT_FILE)).unwrap(),
        bytes
    );
    std::fs::write(root.path().join(DOCUMENT_FILE), b"no document").unwrap();
    assert!(store.read().is_err());
    assert!(read_document(&root.path().join("missing")).is_err());
}
#[test]
fn bounded_reader_rejects_oversized_sparse_metadata() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join(DOCUMENT_FILE);
    std::fs::File::create(&path)
        .unwrap()
        .set_len(64 * 1024 * 1024 + 1)
        .unwrap();
    assert!(read_document(&path).is_err());
}
