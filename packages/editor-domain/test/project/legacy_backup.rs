use beam_editor_domain::{
    Document, Edit, Project,
    project::{legacy_backup_types::V1_ORIGINAL_FILE, store::ProjectStore, types::DOCUMENT_FILE},
    timeline::history,
};
use std::fs;
fn legacy() -> Vec<u8> {
    let mut document = Document::new(Project::new("V1 source".into()));
    document.schema_version = 1;
    serde_json::to_vec(&document).unwrap()
}

#[test]
fn original_v1_bytes_survive_migration_later_edits_and_reopen() {
    let root = tempfile::tempdir().unwrap();
    let bytes = legacy();
    fs::write(root.path().join(DOCUMENT_FILE), &bytes).unwrap();
    let store = ProjectStore::lock(root.path()).unwrap();
    let (migrated, recovered) = store.read().unwrap();
    assert!(!recovered);
    let mut current = store.write(&migrated).unwrap();
    assert_eq!(fs::read(root.path().join(V1_ORIGINAL_FILE)).unwrap(), bytes);
    for name in ["Edit one", "Edit two"] {
        current = history::edited(&current, &Edit::Rename { name: name.into() }).unwrap();
        current = store.write(&current).unwrap();
    }
    assert_eq!(fs::read(root.path().join(V1_ORIGINAL_FILE)).unwrap(), bytes);
    drop(store);
    let store = ProjectStore::lock(root.path()).unwrap();
    assert_eq!(store.read().unwrap().0, current);
    store.write(&current).unwrap();
    assert_eq!(fs::read(root.path().join(V1_ORIGINAL_FILE)).unwrap(), bytes);
}
#[test]
fn recovered_v1_is_preserved_before_an_explicit_recovery_write() {
    let root = tempfile::tempdir().unwrap();
    let bytes = legacy();
    let primary = root.path().join(DOCUMENT_FILE);
    fs::write(&primary, b"corrupt-primary").unwrap();
    fs::write(root.path().join("editor.beam.previous.json"), &bytes).unwrap();
    let store = ProjectStore::lock(root.path()).unwrap();
    let (migrated, recovered) = store.read().unwrap();
    assert!(recovered);
    assert_eq!(fs::read(&primary).unwrap(), b"corrupt-primary");
    store.write(&migrated).unwrap();
    assert_eq!(fs::read(root.path().join(V1_ORIGINAL_FILE)).unwrap(), bytes);
    assert_eq!(
        fs::read(root.path().join("editor.beam.previous.json")).unwrap(),
        bytes
    );
}
#[test]
fn invalid_or_unrelated_original_backups_abort_before_replacing_the_v1_primary() {
    for invalid in [b"corrupt".to_vec(), legacy()] {
        let root = tempfile::tempdir().unwrap();
        let original = legacy();
        let primary = root.path().join(DOCUMENT_FILE);
        fs::write(&primary, &original).unwrap();
        fs::create_dir(root.path().join(".editor")).unwrap();
        fs::write(root.path().join(V1_ORIGINAL_FILE), &invalid).unwrap();
        let store = ProjectStore::lock(root.path()).unwrap();
        let migrated = store.read().unwrap().0;
        assert!(store.write(&migrated).is_err());
        assert_eq!(fs::read(primary).unwrap(), original);
        assert_eq!(
            fs::read(root.path().join(V1_ORIGINAL_FILE)).unwrap(),
            invalid
        );
    }
}
#[cfg(unix)]
#[test]
fn a_symlinked_backup_never_changes_its_external_target() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let original = legacy();
    fs::write(root.path().join(DOCUMENT_FILE), &original).unwrap();
    fs::create_dir(root.path().join(".editor")).unwrap();
    let target = outside.path().join("external");
    fs::write(&target, b"untouched").unwrap();
    std::os::unix::fs::symlink(&target, root.path().join(V1_ORIGINAL_FILE)).unwrap();
    let store = ProjectStore::lock(root.path()).unwrap();
    let migrated = store.read().unwrap().0;
    assert!(store.write(&migrated).is_err());
    assert_eq!(fs::read(target).unwrap(), b"untouched");
    assert_eq!(fs::read(root.path().join(DOCUMENT_FILE)).unwrap(), original);
}
