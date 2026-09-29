//! External GLSL masks mix both real media sources with typed, live parameters.
use super::super::{effects::types::Render, transitions};
use beam_editor_domain::{
    animation::{Binding, Interpolation, Keyframe, Value},
    effects::{Definition, Domain, Parameter, ParameterType, Processor},
    timing::{Time, TimeSpace},
};
use beam_editor_engine::video::pipeline::prepare_update;
use ges::prelude::*;

fn circle() -> Definition {
    Definition {targets:beam_editor_domain::effects::scope_types::clip_targets(),id:"demo.circle-transition".into(),version:1,label:"Circle transition".into(),domain:Domain::Transition,timeline_region:false,
        processor:Processor::TransitionShader {mask_fragment:"uniform float amount; float beam_transition(vec2 uv,float progress) { float radius=progress*0.707107*amount; return 1.0-smoothstep(radius,radius+0.01,length(uv-vec2(0.5))); }".into()},
        parameters:vec![Parameter {key:"amount".into(),label:"Radius".into(),group:"Mask".into(),unit:String::new(),value_type:ParameterType::Number {min:0.1,max:2.,step:0.01},default:Value::Number(1.),animatable:true}]
    }
}

#[test]
fn an_external_circle_mask_renders_real_inputs_and_updates_without_rebuilding() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = transitions::project(root.path(), media.path());
        let definition = circle();
        let mut instance = definition.instantiate();
        instance.parameters.insert(
            "amount".into(),
            Binding::Curve {
                space: TimeSpace::ClipLocal,
                keys: vec![
                    Keyframe {
                        id: uuid::Uuid::new_v4(),
                        time: Time::milliseconds(0),
                        value: Value::Number(0.5),
                        interpolation: Interpolation::Linear,
                    },
                    Keyframe {
                        id: uuid::Uuid::new_v4(),
                        time: Time::milliseconds(400),
                        value: Value::Number(1.5),
                        interpolation: Interpolation::Linear,
                    },
                ],
            },
        );
        let pack = beam_editor_domain::effects::ExtensionPack::new(
            "demo.circle-pack".into(),
            "demo".into(),
            1,
            vec![definition],
            vec![],
        )
        .unwrap();
        beam_editor_domain::effects::pack::register(&mut project, &pack).unwrap();
        assert_eq!(project.extension_packs[0].sha256, pack.sha256);
        project.transitions[0].instance = instance;
        let render = Render::new(root.path(), &project);
        let before = render.image(1000).rgba;
        let pixel = |image: &[u8], x: usize, y: usize| {
            image[(y * 64 + x) * 4..(y * 64 + x) * 4 + 3].to_vec()
        };
        assert!(
            pixel(&before, 32, 32)[2] > 240 && pixel(&before, 2, 2)[0] > 240,
            "circle uses incoming media in the center and outgoing media in corners"
        );
        assert!(pixel(&before, 48, 32)[2] > 240);
        render.image(1100);
        render.image(900);
        assert_eq!(before, render.image(1000).rgba);
        let timeline = render.pipeline.timeline().unwrap();
        let mut after = project.clone();
        after.transitions[0]
            .instance
            .parameters
            .insert("amount".into(), Binding::constant(Value::Number(0.5)));
        let update = prepare_update(&render.pipeline, &project, &after)
            .unwrap()
            .expect("mask uniform parameters publish in place");
        assert_eq!(before, render.image(1000).rgba);
        update.apply();
        assert_eq!(timeline, render.pipeline.timeline().unwrap());
        assert!(
            pixel(&render.image(1000).rgba, 48, 32)[0] > 240,
            "updated radius changes the real mask"
        );
    });
}
