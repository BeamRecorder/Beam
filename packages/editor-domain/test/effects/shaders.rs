use beam_editor_domain::effects::{Definition, Domain, Processor};

#[test]
fn mask_extension_requires_the_explicit_two_input_entry_point() {
    let mut definition=Definition {targets:beam_editor_domain::effects::scope_types::clip_targets(),id:"demo.circle".into(),version:1,label:"Circle".into(),domain:Domain::Transition,parameters:vec![],processor:Processor::TransitionShader {mask_fragment:"float beam_transition(vec2 uv,float progress) { return step(length(uv-vec2(0.5)),progress); }".into()},timeline_region:false};
    definition.validate().unwrap();
    for fragment in [
        "void main() {}",
        "float other(vec2 uv,float progress) {return progress;}",
        "float beam_transition\0",
    ] {
        definition.processor = Processor::TransitionShader {
            mask_fragment: fragment.into(),
        };
        assert!(definition.validate().is_err());
    }
    definition.processor = Processor::TransitionShader {
        mask_fragment: "float beam_transition(vec2 uv,float progress) {return progress;}".into(),
    };
    definition.domain = Domain::Video;
    assert!(definition.validate().is_err());
}

#[test]
fn shader_uniforms_reject_invalid_names_and_float_overflow_before_publication() {
    use beam_editor_domain::{
        animation::Value,
        effects::{Parameter, ParameterType},
    };
    let mut definition = Definition {
        targets: beam_editor_domain::effects::scope_types::clip_targets(),
        id: "demo.uniform".into(),
        version: 1,
        label: "Uniform".into(),
        domain: Domain::Video,
        timeline_region: false,
        processor: Processor::Shader {
            fragment: "uniform float amount; void main() {}".into(),
        },
        parameters: vec![Parameter {
            key: "amount".into(),
            label: "Amount".into(),
            group: String::new(),
            unit: String::new(),
            value_type: ParameterType::Number {
                min: -(f32::MAX as f64),
                max: f32::MAX as f64,
                step: 1.,
            },
            default: Value::Number(0.),
            animatable: true,
        }],
    };
    definition.validate().unwrap();
    for key in ["2amount", "beam_amount", "gl_amount", "tex"] {
        definition.parameters[0].key = key.into();
        assert!(definition.validate().is_err(), "{key}");
    }
    definition.parameters[0].key = "amount".into();
    for (min, max) in [(-1e300, 1.), (-1., 1e300)] {
        definition.parameters[0].value_type = ParameterType::Number { min, max, step: 1. };
        assert!(definition.validate().is_err());
    }
}
