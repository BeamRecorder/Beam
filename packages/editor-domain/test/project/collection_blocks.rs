use beam_editor_domain::{
    Track, TrackKind,
    collections::{PageCache, PersistentCollection},
    project::{blocks, collection_blocks},
};
#[test]
fn separate_header_and_payload_pages_are_shared_and_loaded_on_demand() {
    let root = tempfile::tempdir().unwrap();
    let values: PersistentCollection<_> = (0..256)
        .map(|index| Track::new(index.to_string(), TrackKind::Video))
        .collect::<Vec<_>>()
        .into();
    let references = collection_blocks::store(root.path(), &values).unwrap();
    assert_eq!(references.len(), 2);
    assert_eq!(
        collection_blocks::store(root.path(), &values).unwrap(),
        references
    );
    let cache = PageCache::default();
    let loaded = collection_blocks::load::<Track>(root.path(), &references, &cache).unwrap();
    let history = collection_blocks::load::<Track>(root.path(), &references, &cache).unwrap();
    assert_eq!(loaded.shared_pages(&history), 2);
    assert!(loaded.shares_index(&history));
    assert_eq!(loaded.loaded_pages(), 0);
    assert_eq!(
        collection_blocks::store(root.path(), &loaded).unwrap(),
        references
    );
    assert_eq!(loaded.loaded_pages(), 0);
    let id = loaded.headers().next().unwrap().id;
    assert_eq!(loaded.try_by_id(id).unwrap().unwrap().name, "0");
    assert_eq!(history.loaded_pages(), 1);
    let elsewhere = tempfile::tempdir().unwrap();
    assert_eq!(
        collection_blocks::store(elsewhere.path(), &values).unwrap(),
        references
    );
}
#[test]
fn corrupted_lazy_payloads_fail_on_access_with_hash_context() {
    let root = tempfile::tempdir().unwrap();
    let values: PersistentCollection<_> = vec![Track::new("One".into(), TrackKind::Video)].into();
    let references = collection_blocks::store(root.path(), &values).unwrap();
    let loaded =
        collection_blocks::load::<Track>(root.path(), &references, &PageCache::default()).unwrap();
    std::fs::write(
        root.path()
            .join(format!(".editor/blocks/{}.json", references[0].values)),
        b"corrupt",
    )
    .unwrap();
    let error = loaded.try_page(0, 1).unwrap_err().to_string();
    assert!(error.contains(&references[0].values));
}
#[test]
fn malformed_header_references_and_payload_disagreement_are_rejected() {
    let root = tempfile::tempdir().unwrap();
    let values: PersistentCollection<_> = vec![Track::new("One".into(), TrackKind::Video)].into();
    let mut references = collection_blocks::store(root.path(), &values).unwrap();
    references[0].headers = blocks::put(
        root.path(),
        &vec![Track::new("Other".into(), TrackKind::Video)],
    )
    .unwrap();
    let loaded =
        collection_blocks::load::<Track>(root.path(), &references, &PageCache::default()).unwrap();
    assert!(loaded.try_page(0, 1).is_err());
    references[0].headers = "../outside".into();
    assert!(
        collection_blocks::load::<Track>(root.path(), &references, &PageCache::default()).is_err()
    );
}
