use beam_editor_domain::commands::scope_types::{ScopeAddress, ScopedAction};

#[test]
fn scoped_addresses_and_actions_are_strict_camel_case_in_json_and_schema() {
    let address = serde_json::json!({"kind":"sequence","sequenceId":uuid::Uuid::new_v4()});
    let parsed: ScopeAddress = serde_json::from_value(address.clone()).unwrap();
    assert_eq!(serde_json::to_value(parsed).unwrap(), address);
    let add = serde_json::json!({"type":"add","definitionId":"beam.opacity","definitionVersion":2,"parameters":{}});
    let parsed: ScopedAction = serde_json::from_value(add.clone()).unwrap();
    assert_eq!(serde_json::to_value(parsed).unwrap(), add);
    let mut invalid = add;
    invalid["clip"] = serde_json::json!(uuid::Uuid::new_v4());
    assert!(serde_json::from_value::<ScopedAction>(invalid).is_err());
    let schema = serde_json::to_string(&schemars::schema_for!(ScopedAction)).unwrap();
    assert!(schema.contains("definitionId") && schema.contains("keyframeId"));
    assert!(!schema.contains("definition_id") && !schema.contains("keyframe_id"));
}
