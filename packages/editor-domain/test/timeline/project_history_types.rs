use beam_editor_domain::timeline::project_history_types::ProjectAction;
use uuid::Uuid;
#[test]
fn metadata_inverse_actions_roundtrip_and_reject_unknown_fields() {
    let action = ProjectAction::RenameSequence {
        id: Uuid::new_v4(),
        name: "Timeline".into(),
    };
    let value = serde_json::to_value(&action).unwrap();
    assert_eq!(
        serde_json::from_value::<ProjectAction>(value.clone()).unwrap(),
        action
    );
    let mut invalid = value;
    invalid["extra"] = true.into();
    assert!(serde_json::from_value::<ProjectAction>(invalid).is_err());
}
