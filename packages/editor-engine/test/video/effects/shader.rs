use super::{project, types::Render};
use beam_editor_domain::{
    animation::Value,
    effects::{Definition, Domain, Parameter, ParameterType, Processor},
};

pub fn extension(id: &str, fragment: &str) -> Definition {
    Definition {
        targets: beam_editor_domain::effects::scope_types::clip_targets(),
        id: id.into(),
        version: 1,
        label: id.into(),
        domain: Domain::Video,
        processor: Processor::Shader {
            fragment: fragment.into(),
        },
        timeline_region: false,
        parameters: vec![Parameter {
            key: "amount".into(),
            label: "Amount".into(),
            group: "Color".into(),
            unit: String::new(),
            value_type: ParameterType::Number {
                min: 0.,
                max: 1.,
                step: 0.01,
            },
            default: Value::Number(1.),
            animatable: true,
        }],
    }
}
const SWAP: &str = "#ifdef GL_ES\nprecision mediump float;\n#endif\nvarying vec2 v_texcoord; uniform sampler2D tex; uniform float amount;\nvoid main() { vec4 c = texture2D(tex, v_texcoord); gl_FragColor = vec4(mix(c.rgb, c.bgr, amount), c.a); }";
#[test]
fn a_new_definition_renders_without_changes_to_generic_consumers() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = project();
        let definition = extension("demo.swap", SWAP);
        let instance = definition.instantiate();
        project.definitions.push(definition);
        crate::video::clip_mut(&mut project, 0)
            .instances
            .push(instance);
        let pixel = Render::new(root.path(), &project).center(400);
        assert!(pixel[2] > 240 && pixel[0] < 5, "shader output {pixel:?}");
    });
}
#[test]
fn reserved_shader_uniforms_reject_the_candidate_before_preroll() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = project();
        let definition = extension("demo.invalid", &SWAP.replace("amount", "beam_active"));
        crate::video::clip_mut(&mut project, 0)
            .instances
            .push(definition.instantiate());
        project.definitions.push(definition);
        assert!(beam_editor_engine::video::pipeline::build(root.path(), &project).is_err());
    });
}

#[test]
fn shader_instances_follow_document_order_including_repeated_definitions() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = project();
        let swap = extension("demo.swap", SWAP);
        let red = extension(
            "demo.red",
            &SWAP.replace("mix(c.rgb, c.bgr, amount)", "vec3(c.r, 0.0, 0.0)"),
        );
        let first = red.instantiate();
        let second = swap.instantiate();
        project.definitions.extend([red, swap]);
        crate::video::clip_mut(&mut project, 0).instances = vec![first, second];
        let forward = Render::new(root.path(), &project).center(300);
        assert!(
            forward[2] > 240 && forward[0] < 5,
            "red then swap: {forward:?}"
        );
        crate::video::clip_mut(&mut project, 0).instances.reverse();
        let reversed = Render::new(root.path(), &project).center(300);
        assert!(
            reversed[..3].iter().all(|v| *v < 5),
            "swap then red: {reversed:?}"
        );
    });
}

#[test]
fn invalid_fragment_program_reports_a_native_compile_error() {
    use ges::prelude::*;
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = project();
        let broken = extension(
            "demo.broken",
            &SWAP.replace("gl_FragColor =", "this_will_not_compile ="),
        );
        crate::video::clip_mut(&mut project, 0)
            .instances
            .push(broken.instantiate());
        project.definitions.push(broken);
        let pipeline = beam_editor_engine::video::pipeline::build(root.path(), &project).unwrap();
        beam_editor_engine::video::preview::attach(
            &pipeline,
            &project.canvas,
            std::sync::Arc::default(),
        )
        .unwrap();
        let _ = pipeline.set_state(gst::State::Paused);
        let message = pipeline
            .bus()
            .unwrap()
            .timed_pop_filtered(gst::ClockTime::from_seconds(5), &[gst::MessageType::Error]);
        pipeline.set_state(gst::State::Null).unwrap();
        assert!(
            message.is_some(),
            "an invalid external shader must fail candidate preroll explicitly"
        );
    });
}
