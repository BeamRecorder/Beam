use beam_editor_domain::{
    animation::{Binding, Value},
    effects::catalog,
    recording::decisions,
    timing::{Time, TimeRange, TimeSpace},
};

#[test]
fn zoom_requires_a_region_and_normalized_finite_center() {
    let defs = catalog::builtins();
    let mut instance = defs
        .iter()
        .find(|d| d.id == decisions::ZOOM_DEFINITION)
        .unwrap()
        .instantiate();
    assert!(instance.validate(&defs).is_err());
    instance.range = Some(TimeRange {
        space: TimeSpace::Source,
        start: Time::ZERO,
        end: Time::milliseconds(1000),
    });
    assert!(instance.validate(&defs).is_ok());
    instance.parameters.insert(
        "center".into(),
        Binding::constant(Value::Point([-0.1, 0.5])),
    );
    assert!(instance.validate(&defs).is_err());
}
#[test]
fn legacy_motion_never_silently_ignores_edited_entry_exit_parameters() {
    let defs = catalog::builtins();
    let mut instance = defs
        .iter()
        .find(|d| d.id == decisions::ZOOM_DEFINITION)
        .unwrap()
        .instantiate();
    instance.range = Some(TimeRange {
        space: TimeSpace::Source,
        start: Time::ZERO,
        end: Time::milliseconds(1000),
    });
    instance.parameters.insert(
        "interpolation".into(),
        Binding::constant(Value::Choice("legacySpring".into())),
    );
    assert!(instance.validate(&defs).is_err());
    instance
        .parameters
        .insert("entryMs".into(), Binding::constant(Value::Number(1522.575)));
    instance
        .parameters
        .insert("exitMs".into(), Binding::constant(Value::Number(1015.05)));
    assert!(instance.validate(&defs).is_ok());
}
#[test]
fn cursor_region_and_numeric_bindings_use_the_common_contract() {
    let defs = catalog::builtins();
    let mut instance = defs
        .iter()
        .find(|d| d.id == decisions::CURSOR_DEFINITION)
        .unwrap()
        .instantiate();
    assert!(instance.validate(&defs).is_ok());
    instance
        .parameters
        .insert("sizeScale".into(), Binding::constant(Value::Number(0.)));
    assert!(instance.validate(&defs).is_err());
}

#[test]
fn recording_processors_in_packs_cannot_claim_unsupported_parameter_schemas() {
    let mut definition = catalog::builtins()
        .into_iter()
        .find(|d| d.id == decisions::CURSOR_DEFINITION)
        .unwrap();
    definition.id = "example.cursor".into();
    assert!(definition.validate().is_ok());
    definition.parameters[0].key = "unsupported".into();
    assert!(definition.validate().is_err());
    let mut definition = catalog::builtins()
        .into_iter()
        .find(|d| d.id == decisions::ZOOM_DEFINITION)
        .unwrap();
    definition.parameters.clear();
    assert!(definition.validate().is_err());
}
