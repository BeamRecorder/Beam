use beam_editor_domain::{
    Project,
    project::{
        block_types::{CLIPS_PER_PAGE, DocumentIndex, MAX_BLOCK_BYTES},
        blocks,
    },
};

#[test]
fn index_uses_paged_clip_chunks_above_one_page() {
    let root = tempfile::tempdir().unwrap();
    let mut project = crate::fixtures::project();
    std::fs::create_dir_all(root.path().join("media")).unwrap();
    std::fs::write(root.path().join("media/source.webm"), b"page-test-source").unwrap();
    crate::fixtures::source_identity(&mut project, b"page-test-source");
    let mut template = (*crate::fixtures::clip(&project, 0)).clone();
    project.clips = Default::default();
    for index in 0..(CLIPS_PER_PAGE + 1) {
        template.id = uuid::Uuid::new_v4();
        template.start_ms = index as u64 * 2;
        template.duration_ms = 1;
        project.clips.try_push(template.clone()).unwrap();
    }
    let document = beam_editor_domain::Document::new(project);
    let index = blocks::index(root.path(), &document).unwrap();
    assert!(
        matches!(&index.sequences[0].state.clips,beam_editor_domain::project::block_types::CollectionIndex::Paged(pages) if pages.len()==2)
    );
    assert_eq!(blocks::load(root.path(), index).unwrap(), document);
}

#[test]
fn index_contract_round_trips_as_typed_json_and_rejects_unknown_fields() {
    let root = tempfile::tempdir().unwrap();
    let index = blocks::index(
        root.path(),
        &beam_editor_domain::Document::new(Project::new("json".into())),
    )
    .unwrap();
    let encoded = serde_json::to_vec(&index).unwrap();
    let decoded: DocumentIndex = serde_json::from_slice(&encoded).unwrap();
    assert_eq!(decoded.storage_version, 2);
    let mut value: serde_json::Value = serde_json::from_slice(&encoded).unwrap();
    value["unexpected"] = serde_json::json!(true);
    assert!(serde_json::from_value::<DocumentIndex>(value).is_err());
}

#[test]
fn declared_operational_budgets_are_explicit_and_nonzero() {
    assert_eq!(CLIPS_PER_PAGE, 128);
    assert_eq!(MAX_BLOCK_BYTES, 64 * 1024 * 1024);
}

#[test]
fn older_state_indexes_without_sequence_effects_keep_their_empty_decisions() {
    let root = tempfile::tempdir().unwrap();
    let document = beam_editor_domain::Document::new(Project::new("Legacy state metadata".into()));
    let index = blocks::index(root.path(), &document).unwrap();
    let mut value = serde_json::to_value(index).unwrap();
    value["sequences"][0]["state"]
        .as_object_mut()
        .unwrap()
        .remove("sequenceInstances");
    let legacy: DocumentIndex = serde_json::from_value(value).unwrap();
    let loaded = blocks::load(root.path(), legacy).unwrap();
    assert!(loaded.project.sequence_instances.is_empty());
    assert_eq!(loaded, document);
}
