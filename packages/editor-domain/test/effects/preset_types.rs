use beam_editor_domain::effects::{
    preset_types::{Preset, PresetTarget},
    presets,
};
use serde_json::json;
use uuid::Uuid;

#[test]
fn preset_targets_require_explicit_ids_and_presets_round_trip_without_label_identity() {
    let target = PresetTarget::Effect {
        clip_id: Uuid::new_v4(),
        instance_id: Uuid::new_v4(),
    };
    let value = serde_json::to_value(target).unwrap();
    assert!(value["clipId"].is_string());
    assert!(
        serde_json::from_value::<PresetTarget>(json!({"kind":"effect","name":"Opacity"})).is_err()
    );
    assert!(
        serde_json::from_value::<PresetTarget>(
            json!({"kind":"effect","clipId":{"createdBy":"clip"},"instanceId":Uuid::new_v4()})
        )
        .is_err()
    );
    assert!(
        serde_json::from_value::<PresetTarget>(
            json!({"kind":"transition","instanceId":Uuid::new_v4(),"clipId":Uuid::new_v4()})
        )
        .is_err()
    );
    let preset = presets::builtins().remove(0);
    assert_eq!(
        serde_json::from_value::<Preset>(serde_json::to_value(&preset).unwrap()).unwrap(),
        preset
    );
}

#[test]
fn scoped_preset_addresses_use_explicit_camel_case_ids_in_json_and_schema() {
    for target in [
        json!({"kind":"track","trackId":Uuid::new_v4(),"instanceId":Uuid::new_v4()}),
        json!({"kind":"sequence","sequenceId":Uuid::new_v4(),"instanceId":Uuid::new_v4()}),
    ] {
        let decoded: PresetTarget = serde_json::from_value(target.clone()).unwrap();
        assert_eq!(serde_json::to_value(decoded).unwrap(), target);
    }
    let schema = serde_json::to_string(&schemars::schema_for!(PresetTarget)).unwrap();
    assert!(schema.contains("trackId") && schema.contains("sequenceId"));
    assert!(!schema.contains("track_id") && !schema.contains("sequence_id"));
}
