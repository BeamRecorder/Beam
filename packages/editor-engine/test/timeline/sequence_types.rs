use beam_editor_engine::{Document, Project};
#[test]
fn sequences_reject_unknown_fields_and_preserve_stable_ids() {
    let document = Document::new(Project::new("P".into()));
    let sequence = &document.sequences[0];
    let mut value = serde_json::to_value(sequence).unwrap();
    assert_eq!(
        serde_json::from_value::<beam_editor_engine::timeline::sequence_types::Sequence>(
            value.clone()
        )
        .unwrap(),
        *sequence
    );
    value["extra"] = serde_json::json!(true);
    assert!(
        serde_json::from_value::<beam_editor_engine::timeline::sequence_types::Sequence>(value)
            .is_err()
    );
}
