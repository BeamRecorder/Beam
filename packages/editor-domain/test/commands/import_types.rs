use beam_editor_domain::commands::import_types::ImportPublication;

#[test]
fn publication_is_distinct_from_a_receipt_and_contains_only_created_identities() {
    let publication = ImportPublication {
        project_id: uuid::Uuid::new_v4(),
        sequence_id: uuid::Uuid::new_v4(),
        revision: 1,
        idempotency_key: "import".into(),
        fingerprint: "a".repeat(64),
        asset_ids: vec![uuid::Uuid::new_v4()],
        clip_ids: vec![uuid::Uuid::new_v4()],
    };
    let value = serde_json::to_value(&publication).unwrap();
    assert_eq!(value["assetIds"].as_array().unwrap().len(), 1);
    assert!(value.get("results").is_none());
    assert!(value.get("path").is_none());
    assert_eq!(
        serde_json::from_value::<ImportPublication>(value).unwrap(),
        publication
    );
}
