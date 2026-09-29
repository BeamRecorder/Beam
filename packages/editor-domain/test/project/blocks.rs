use beam_editor_domain::{
    Document, Project,
    project::{blocks, store::ProjectStore},
};

#[test]
fn immutable_decision_blocks_deduplicate_content_and_detect_tampering() {
    let root = tempfile::tempdir().unwrap();
    let payload = vec!["same", "decision"];
    let first = blocks::put(root.path(), &payload).unwrap();
    let second = blocks::put(root.path(), &payload).unwrap();
    assert_eq!(first, second);
    assert_eq!(
        blocks::get::<Vec<String>>(root.path(), &first).unwrap(),
        payload
    );
    let path = root
        .path()
        .join(".editor/blocks")
        .join(format!("{first}.json"));
    std::fs::write(path, b"tampered").unwrap();
    assert!(blocks::get::<Vec<String>>(root.path(), &first).is_err());
    assert!(blocks::put(root.path(), &payload).is_err());
}

#[test]
fn indexed_document_round_trips_history_and_source_bytes_without_rewriting_media() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(root.path().join("media")).unwrap();
    let source_bytes = b"immutable-media-sentinel";
    std::fs::write(root.path().join("media/source.webm"), source_bytes).unwrap();
    let mut project = crate::fixtures::project();
    crate::fixtures::source_identity(&mut project, source_bytes);
    let document = Document::new(project);
    let index = blocks::index(root.path(), &document).unwrap();
    assert_eq!(blocks::load(root.path(), index).unwrap(), document);
    assert_eq!(
        std::fs::read(root.path().join("media/source.webm")).unwrap(),
        source_bytes
    );
    assert_eq!(
        std::fs::read_dir(root.path().join(".editor/blocks"))
            .unwrap()
            .count(),
        7
    );
}

#[test]
fn oversized_or_invalid_content_references_fail_before_decoding() {
    let root = tempfile::tempdir().unwrap();
    assert!(blocks::get::<serde_json::Value>(root.path(), "../bad").is_err());
    let sparse = root.path().join("oversized");
    std::fs::File::create(&sparse)
        .unwrap()
        .set_len(64 * 1024 * 1024 + 1)
        .unwrap();
    assert!(blocks::read_bytes(&sparse).is_err());
    let mut index =
        blocks::index(root.path(), &Document::new(Project::new("version".into()))).unwrap();
    index.storage_version += 1;
    assert!(blocks::load(root.path(), index).is_err());
}

#[test]
fn store_publication_keeps_media_source_and_uses_content_addressed_pages() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(root.path().join("media")).unwrap();
    let media_path = root.path().join("media/source.webm");
    std::fs::write(&media_path, b"original").unwrap();
    let store = ProjectStore::lock(root.path()).unwrap();
    let mut project = crate::fixtures::project();
    crate::fixtures::source_identity(&mut project, b"original");
    let document = Document::new(project);
    store.write(&document).unwrap();
    store.write(&document).unwrap();
    assert_eq!(std::fs::read(media_path).unwrap(), b"original");
}
#[test]
fn storage_v1_decodes_old_eager_references_and_v2_rejects_them() {
    use beam_editor_domain::project::block_types::CollectionIndex;
    let root = tempfile::tempdir().unwrap();
    let document = Document::new(Project::new("Legacy blocks".into()));
    let mut index = blocks::index(root.path(), &document).unwrap();
    index.sequences[0].state.tracks =
        CollectionIndex::LegacyHash(blocks::put(root.path(), &document.project.tracks).unwrap());
    index.sequences[0].state.clips = CollectionIndex::LegacyPages(vec![
        blocks::put(root.path(), &Vec::<beam_editor_domain::Clip>::new()).unwrap(),
    ]);
    assert!(blocks::load(root.path(), index.clone()).is_err());
    index.storage_version = 1;
    let loaded = blocks::load(root.path(), index).unwrap();
    assert_eq!(loaded, document);
    assert!(loaded.project.tracks.loaded_pages() > 0);
    let sequence = blocks::store_sequence(root.path(), &loaded.sequences[0]).unwrap();
    assert_eq!(
        blocks::load_sequence(root.path(), sequence).unwrap(),
        loaded.sequences[0]
    );
    let state = blocks::store_state(root.path(), &loaded.sequences[0].state).unwrap();
    assert_eq!(
        blocks::load_state(root.path(), &state).unwrap(),
        loaded.sequences[0].state
    );
}
#[test]
fn v2_requires_source_identity_and_does_not_claim_corrupt_lazy_fx_are_valid() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(root.path().join("media")).unwrap();
    std::fs::write(root.path().join("media/source.webm"), b"immutable-source").unwrap();
    let mut project = crate::fixtures::project();
    assert!(blocks::index(root.path(), &Document::new(project.clone())).is_err());
    crate::fixtures::source_identity(&mut project, b"immutable-source");
    let document = Document::new(project);
    let index = blocks::index(root.path(), &document).unwrap();
    let payload = match &index.sequences[0].state.clips {
        beam_editor_domain::project::block_types::CollectionIndex::Paged(pages) => {
            pages[0].values.clone()
        }
        _ => panic!("requires paged clips"),
    };
    std::fs::write(
        root.path().join(format!(".editor/blocks/{payload}.json")),
        b"corrupted-fx",
    )
    .unwrap();
    let loaded = blocks::load(root.path(), index.clone()).unwrap();
    assert_eq!(loaded.project.clips.loaded_pages(), 0);
    assert!(
        loaded
            .project
            .clips
            .try_by_id(loaded.project.clips.headers().next().unwrap().id)
            .unwrap_err()
            .to_string()
            .contains(&payload)
    );
    let mut bad_asset = document.project.assets[0].clone();
    bad_asset.identity = None;
    let mut invalid = index.clone();
    invalid.assets[0] = blocks::put(root.path(), &bad_asset).unwrap();
    assert!(blocks::load(root.path(), invalid).is_err());
    let mut invalid = index;
    invalid.active_sequence = uuid::Uuid::new_v4();
    assert!(blocks::load(root.path(), invalid).is_err());
}
