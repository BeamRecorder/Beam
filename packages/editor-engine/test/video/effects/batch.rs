use super::{definition, project, types::Render};
use beam_editor_domain::{
    animation::{Binding, Value},
    effects::{Definition, Domain, Processor},
    timing::{Time, TimeRange, TimeSpace},
};
use beam_editor_engine::video::pipeline;

#[test]
fn batched_bindings_keep_ranges_and_disabled_instances_independent() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = project();
        for _ in 0..3 {
            let mut effect = definition(&project, "beam.opacity").instantiate();
            effect
                .parameters
                .insert("opacity".into(), Binding::constant(Value::Number(0.5)));
            crate::video::clip_mut(&mut project, 0)
                .instances
                .push(effect);
        }
        crate::video::clip_mut(&mut project, 0).instances[1].enabled = false;
        crate::video::clip_mut(&mut project, 0).instances[2].range = Some(TimeRange {
            space: TimeSpace::ClipLocal,
            start: Time::milliseconds(300),
            end: Time::milliseconds(600),
        });
        let render = Render::new(root.path(), &project);
        assert!((i16::from(render.center(400)[0]) - 64).abs() <= 3);
        assert!(
            (i16::from(render.center(600)[0]) - 128).abs() <= 3,
            "ranges stay half-open inside a shared pass"
        );
        let mut after = project.clone();
        crate::video::clip_mut(&mut after, 0).instances[0]
            .parameters
            .insert("opacity".into(), Binding::constant(Value::Number(1.)));
        pipeline::prepare_update(&render.pipeline, &project, &after)
            .unwrap()
            .unwrap()
            .apply();
        assert!((i16::from(render.center(400)[0]) - 128).abs() <= 3);
    });
}

#[test]
fn family_boundaries_keep_native_color_and_alpha_surfaces_in_order() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut fused = project();
        crate::video::clip_mut(&mut fused, 0)
            .generator
            .as_mut()
            .unwrap()
            .parameters
            .insert(
                "color".into(),
                Binding::constant(Value::Color([0.17, 0.43, 0.77, 0.64])),
            );
        for i in 0..8 {
            let mut color = definition(&fused, "beam.color").instantiate();
            for (key, value) in [
                ("brightness", if i % 2 == 0 { 0.02 } else { -0.01 }),
                ("contrast", 1.02),
                ("hue", 0.08),
                ("saturation", 0.8),
            ] {
                color
                    .parameters
                    .insert(key.into(), Binding::constant(Value::Number(value)));
            }
            crate::video::clip_mut(&mut fused, 0).instances.push(color);
            let mut opacity = definition(&fused, "beam.opacity").instantiate();
            opacity
                .parameters
                .insert("opacity".into(), Binding::constant(Value::Number(0.92)));
            crate::video::clip_mut(&mut fused, 0)
                .instances
                .push(opacity);
        }
        let mut separate = fused.clone();
        let identity=Definition {targets:beam_editor_domain::effects::scope_types::clip_targets(),id:"demo.identity".into(),version:1,label:"Identity barrier".into(),domain:Domain::Video,timeline_region:false,parameters:vec![],processor:Processor::Shader {fragment:"#ifdef GL_ES\nprecision mediump float;\n#endif\nvarying vec2 v_texcoord;uniform sampler2D tex;void main() {gl_FragColor=texture2D(tex,v_texcoord);}".into()}};
        let instances = crate::video::clip(&separate, 0)
            .instances
            .iter()
            .flat_map(|i| [i.clone(), identity.instantiate()])
            .collect();
        crate::video::clip_mut(&mut separate, 0).instances = instances;
        separate.definitions.push(identity);
        let actual = Render::new(root.path(), &fused).center(400);
        let reference = Render::new(root.path(), &separate).center(400);
        assert_eq!(
            actual, reference,
            "native colour/alpha family boundaries preserve every intermediate RGBA8 surface"
        );
    });
}

#[test]
fn native_family_boundaries_preserve_grey_channels_at_rgba8_rounding_edges() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut original = project();
        let mut clip = crate::video::clip_mut(&mut original, 0);
        clip.generator.as_mut().unwrap().parameters.insert(
            "color".into(),
            Binding::constant(Value::Color([139. / 255., 139. / 255., 137. / 255., 1.])),
        );
        clip.effects.brightness = 0.12;
        clip.effects.saturation = 0.65;
        clip.effects.opacity = 0.8;
        drop(clip);
        let mut typed = original.clone();
        let mut color = definition(&typed, "beam.color").instantiate();
        color
            .parameters
            .insert("brightness".into(), Binding::constant(Value::Number(0.12)));
        color
            .parameters
            .insert("saturation".into(), Binding::constant(Value::Number(0.65)));
        let mut opacity = definition(&typed, "beam.opacity").instantiate();
        opacity
            .parameters
            .insert("opacity".into(), Binding::constant(Value::Number(0.8)));
        let mut clip = crate::video::clip_mut(&mut typed, 0);
        clip.effects.brightness = 0.;
        clip.effects.saturation = 1.;
        clip.effects.opacity = 1.;
        clip.instances = vec![color, opacity];
        drop(clip);
        assert_eq!(
            Render::new(root.path(), &typed).image(400).rgba,
            Render::new(root.path(), &original).image(400).rgba
        );
    });
}
