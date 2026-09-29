use beam_editor_domain::{
    animation::{Binding, Value},
    effects::{catalog, definition, presets},
    timing::{Time, TimeRange, TimeSpace},
};

#[test]
fn builtin_templates_validate_and_application_keeps_instance_identity_and_metadata() {
    let catalog = catalog::builtins();
    let presets = presets::builtins();
    presets::validate_catalog(&presets, &catalog).unwrap();
    let template = presets
        .iter()
        .find(|preset| preset.definition_id == "beam.opacity")
        .unwrap();
    let mut first = definition(&catalog, "beam.opacity", 1)
        .unwrap()
        .instantiate();
    first.name = Some("Independent occurrence".into());
    first.enabled = false;
    first.range = Some(TimeRange {
        space: TimeSpace::ClipLocal,
        start: Time::ZERO,
        end: Time::milliseconds(500),
    });
    let original = first.clone();
    template.apply(&mut first, &catalog).unwrap();
    assert_eq!(
        (first.id, &first.name, first.enabled, first.range),
        (
            original.id,
            &original.name,
            original.enabled,
            original.range
        )
    );
    let mut second = original.clone();
    template.apply(&mut second, &catalog).unwrap();
    let Binding::Curve {
        keys: first_keys, ..
    } = &first.parameters["opacity"]
    else {
        panic!("expected curve")
    };
    let Binding::Curve {
        keys: second_keys, ..
    } = &second.parameters["opacity"]
    else {
        panic!("expected curve")
    };
    assert!(
        first_keys
            .iter()
            .all(|key| second_keys.iter().all(|other| key.id != other.id))
    );
    assert_eq!(first_keys[1].value, Value::Number(1.));
}
#[test]
fn invalid_identity_bindings_definition_and_duplicate_versions_are_rejected() {
    let catalog = catalog::builtins();
    let valid = presets::builtins().remove(0);
    for change in 0..11 {
        let mut preset = valid.clone();
        match change {
            0 => preset.id.clear(),
            1 => preset.id = "illegal/identity".into(),
            2 => preset.version = 0,
            3 => preset.label = "  ".into(),
            4 => preset.label = "nul\0".into(),
            5 => preset.definition_version = 99,
            6 => preset.parameters.clear(),
            7 => {
                preset
                    .parameters
                    .insert("brightness".into(), Binding::constant(Value::Number(2.)));
            }
            8 => preset.id = "x".repeat(129),
            9 => preset.label = "x".repeat(257),
            _ => preset.definition_id = "missing.definition".into(),
        }
        assert!(preset.validate(&catalog).is_err());
    }
    assert!(presets::validate_catalog(&[valid.clone(), valid.clone()], &catalog).is_err());
    let mut next = valid.clone();
    next.version += 1;
    presets::validate_catalog(&[valid.clone(), next], &catalog).unwrap();
    let mut instance = definition(&catalog, "beam.opacity", 1)
        .unwrap()
        .instantiate();
    let before = instance.clone();
    assert!(valid.apply(&mut instance, &catalog).is_err());
    assert_eq!(instance, before);
}

#[test]
fn builtins_provide_color_two_fades_centered_framing_and_gain() {
    let catalog = catalog::builtins();
    let templates = presets::builtins();
    assert_eq!(
        templates
            .iter()
            .filter(|preset| preset.version == 1)
            .count(),
        5
    );
    for (id, key, start, middle, end) in [
        ("beam.color.warm", "brightness", 0.05, 0.05, 0.05),
        ("beam.opacity.fadeIn", "opacity", 0., 0.5, 1.),
        ("beam.opacity.fadeOut", "opacity", 1., 0.5, 0.),
        ("beam.framing.centered", "scale", 1.25, 1.25, 1.25),
        ("beam.gain.voice", "volume", 1.25, 1.25, 1.25),
    ] {
        let template = templates.iter().find(|preset| preset.id == id).unwrap();
        let mut instance = definition(
            &catalog,
            &template.definition_id,
            template.definition_version,
        )
        .unwrap()
        .instantiate();
        template.apply(&mut instance, &catalog).unwrap();
        for (time, expected) in [(0, start), (500, middle), (1000, end)] {
            assert_eq!(
                instance.parameters[key].evaluate(Time::milliseconds(time)),
                Value::Number(expected),
                "{id} at {time}ms"
            );
        }
        if id == "beam.framing.centered" {
            for position in ["x", "y"] {
                assert_eq!(
                    instance.parameters[position].evaluate(Time::ZERO),
                    Value::Number(0.5)
                );
            }
        }
    }
}
