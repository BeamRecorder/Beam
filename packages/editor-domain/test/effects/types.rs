use beam_editor_domain::effects::{Definition, Instance, Transition, catalog::builtins};
use uuid::Uuid;

#[test]
fn builtin_definitions_have_stable_serializable_identity_and_processing_family() {
    for definition in builtins() {
        let value = serde_json::to_value(&definition).unwrap();
        let decoded: Definition = serde_json::from_value(value).unwrap();
        assert_eq!(decoded, definition);
        assert!(decoded.validate().is_ok());
    }
}

#[test]
fn effect_instances_round_trip_independent_ids_and_reject_unknown_fields() {
    let definition = builtins()
        .into_iter()
        .find(|item| item.id == "beam.opacity")
        .unwrap();
    let instance = definition.instantiate();
    let mut value = serde_json::to_value(&instance).unwrap();
    let decoded: Instance = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(decoded, instance);
    assert_ne!(decoded.id, Uuid::nil());
    value["extra"] = serde_json::json!(true);
    assert!(serde_json::from_value::<Instance>(value).is_err());
}

#[test]
fn transition_wire_contract_keeps_two_clip_endpoints_and_instance_payload() {
    let definition = builtins()
        .into_iter()
        .find(|item| item.id == "beam.crossfade")
        .unwrap();
    let expected = Transition {
        instance: definition.instantiate(),
        from_clip: Uuid::new_v4(),
        to_clip: Uuid::new_v4(),
        duration_ms: 750,
    };
    let value = serde_json::to_value(&expected).unwrap();
    let decoded: Transition = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(decoded.from_clip, expected.from_clip);
    assert_eq!(decoded.to_clip, expected.to_clip);
    assert_eq!(decoded.duration_ms, 750);
    let mut malformed = value;
    malformed["unknown"] = serde_json::json!(1);
    assert!(serde_json::from_value::<Transition>(malformed).is_err());
}

#[test]
fn instance_names_remain_optional_and_round_trip_without_changing_identity() {
    let definitions = builtins();
    let mut instance = definitions
        .iter()
        .find(|d| d.id == "beam.opacity")
        .unwrap()
        .instantiate();
    let old = serde_json::to_value(&instance).unwrap();
    assert!(old.get("name").is_none());
    assert_eq!(serde_json::from_value::<Instance>(old).unwrap().name, None);
    let id = instance.id;
    instance.name = Some("Zoom on settings".into());
    instance.validate(&definitions).unwrap();
    let restored: Instance =
        serde_json::from_value(serde_json::to_value(&instance).unwrap()).unwrap();
    assert_eq!(restored, instance);
    assert_eq!(restored.id, id);
    assert_eq!(restored.duplicate().name, instance.name);
}

#[test]
fn instance_names_reject_empty_nul_and_over_budget_content() {
    let definitions = builtins();
    let mut instance = definitions[0].instantiate();
    for name in [String::new(), "   ".into(), "a\0b".into(), "x".repeat(257)] {
        instance.name = Some(name);
        assert!(instance.validate(&definitions).is_err());
    }
    instance.name = Some("x".repeat(256));
    instance.validate(&definitions).unwrap();
}
