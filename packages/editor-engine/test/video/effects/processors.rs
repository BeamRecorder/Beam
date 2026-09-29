use super::{definition, project, types::Render};
use beam_editor_domain::{
    animation::{Binding, Interpolation, Keyframe, Value},
    timing::{Time, TimeRange, TimeSpace},
};

#[test]
fn repeated_opacity_instances_compose_and_bypass_independently() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = project();
        for _ in 0..2 {
            let mut effect = definition(&project, "beam.opacity").instantiate();
            effect
                .parameters
                .insert("opacity".into(), Binding::constant(Value::Number(0.5)));
            crate::video::clip_mut(&mut project, 0)
                .instances
                .push(effect);
        }
        let first = Render::new(root.path(), &project).center(200);
        assert!(
            (i16::from(first[0]) - 64).abs() <= 3,
            "two instances must multiply, {first:?}"
        );
        crate::video::clip_mut(&mut project, 0).instances[0].enabled = false;
        crate::video::clip_mut(&mut project, 0).instances[1].range = Some(TimeRange {
            space: TimeSpace::ClipLocal,
            start: Time::milliseconds(100),
            end: Time::milliseconds(400),
        });
        let render = Render::new(root.path(), &project);
        assert!((i16::from(render.center(200)[0]) - 128).abs() <= 3);
        assert!(render.center(600)[0] > 240);
    });
}
#[test]
fn one_hundred_instances_are_rendered_and_remain_individually_identified() {
    use ges::prelude::*;
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = project();
        for _ in 0..100 {
            let mut instance = definition(&project, "beam.color").instantiate();
            instance.parameters.insert(
                "brightness".into(),
                Binding::Curve {
                    space: TimeSpace::ClipLocal,
                    keys: vec![
                        Keyframe {
                            id: uuid::Uuid::new_v4(),
                            time: Time::milliseconds(0),
                            value: Value::Number(0.),
                            interpolation: Interpolation::Linear,
                        },
                        Keyframe {
                            id: uuid::Uuid::new_v4(),
                            time: Time::milliseconds(1000),
                            value: Value::Number(0.01),
                            interpolation: Interpolation::Linear,
                        },
                    ],
                },
            );
            crate::video::clip_mut(&mut project, 0)
                .instances
                .push(instance);
        }
        let render = Render::new(root.path(), &project);
        let timeline = render.pipeline.timeline().unwrap();
        let node = timeline.layers()[0]
            .clips()
            .into_iter()
            .find(|n| n.name().is_some_and(|name| name.starts_with("clip-")))
            .unwrap();
        assert_eq!(
            node.top_effects().len(),
            16,
            "thirteen bounded passes share surfaces for all one hundred operations"
        );
        let compiled = beam_editor_engine::video::effects::compiled_instances(&render.pipeline);
        assert!(
            crate::video::clip_mut(&mut project, 0)
                .instances
                .iter()
                .all(|instance| compiled.contains(&instance.id))
        );
        let early = render.center(100);
        let late = render.center(800);
        assert!(
            late[0] > 240 && i16::from(late[1]) - i16::from(early[1]) > 20,
            "all one hundred curves change the real pixels: {early:?} -> {late:?}"
        );
        assert_eq!(early, render.center(100));
    });
}

#[test]
fn rotation_and_translation_use_real_gpu_geometry() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = project();
        let mut transform = definition(&project, "beam.transform").instantiate();
        transform
            .parameters
            .insert("rotation".into(), Binding::constant(Value::Number(45.)));
        crate::video::clip_mut(&mut project, 0)
            .instances
            .push(transform);
        let render = Render::new(root.path(), &project);
        let image = render.image(200);
        assert!(
            image.rgba[..3].iter().all(|v| *v < 5),
            "rotation makes the corner transparent over black"
        );
        assert!(
            image.rgba[(32 * 64 + 32) * 4] > 240,
            "rotation keeps the center red"
        );
    });
}
