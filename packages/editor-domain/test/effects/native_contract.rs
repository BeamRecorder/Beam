use beam_editor_domain::{
    animation::Value,
    effects::{ParameterType, Processor, catalog::builtins},
};

#[test]
fn native_builtin_aliases_keep_supported_defaults_types_and_animation() {
    for mut definition in builtins().into_iter().filter(|d| {
        matches!(
            d.processor,
            Processor::ColorBalance
                | Processor::Opacity
                | Processor::Transform
                | Processor::Gain
                | Processor::Solid
        )
    }) {
        definition.id = format!("demo.{}", definition.id);
        definition.label = "A labelled native preset".into();
        definition.validate().unwrap();
        definition.parameters.reverse();
        definition.validate().unwrap();
        definition.parameters[0].animatable = false;
        definition.validate().unwrap();
        let mut wrong_key = definition.clone();
        wrong_key.parameters[0].key = "ignored".into();
        assert!(wrong_key.validate().is_err());
        let mut wrong_type = definition.clone();
        wrong_type.parameters[0].value_type = ParameterType::Boolean;
        wrong_type.parameters[0].default = Value::Boolean(false);
        assert!(wrong_type.validate().is_err());
        definition.parameters.pop();
        assert!(definition.validate().is_err());
    }
}

#[test]
fn narrowed_controls_are_valid_and_out_of_bounds_controls_are_rejected() {
    let mut definition = builtins()
        .into_iter()
        .find(|d| d.id == "beam.gain")
        .unwrap();
    definition.parameters[0].value_type = ParameterType::Number {
        min: 0.5,
        max: 2.,
        step: 0.1,
    };
    definition.validate().unwrap();
    for (min, max) in [(-0.1, 10.), (0., 10.1)] {
        definition.parameters[0].value_type = ParameterType::Number {
            min,
            max,
            step: 0.1,
        };
        assert!(definition.validate().is_err());
    }
}
