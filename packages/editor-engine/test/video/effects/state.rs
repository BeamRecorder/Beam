use super::{definition, project, types::Render};
use beam_editor_domain::{
    animation::{Binding, Interpolation, Keyframe, Value},
    timing::{Time, TimeSpace},
};
use uuid::Uuid;

#[test]
fn binding_curves_render_the_same_frame_after_out_of_order_seeks() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = project();
        let mut effect = definition(&project, "beam.opacity").instantiate();
        effect.parameters.insert(
            "opacity".into(),
            Binding::Curve {
                space: TimeSpace::ClipLocal,
                keys: vec![
                    Keyframe {
                        id: Uuid::new_v4(),
                        time: Time::milliseconds(0),
                        value: Value::Number(0.),
                        interpolation: Interpolation::Linear,
                    },
                    Keyframe {
                        id: Uuid::new_v4(),
                        time: Time::milliseconds(1000),
                        value: Value::Number(1.),
                        interpolation: Interpolation::Linear,
                    },
                ],
            },
        );
        crate::video::clip_mut(&mut project, 0)
            .instances
            .push(effect);
        let render = Render::new(root.path(), &project);
        let before = render.image(500).rgba;
        assert!((i16::from(before[(32 * 64 + 32) * 4]) - 128).abs() <= 3);
        render.image(800);
        render.image(100);
        assert_eq!(before, render.image(500).rgba);
    });
}

#[test]
fn clip_local_curve_origin_survives_a_cut_and_move_with_real_source_frames() {
    use beam_editor_engine::{Canvas, video::probe};
    crate::fixtures::context(|| {
        let media = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        let source = crate::fixtures::media(media.path(), "curve.webm", false);
        let asset = probe::import(root.path(), &source).unwrap();
        let mut project = project();
        project.canvas = Canvas::from_source(asset.width, asset.height);
        crate::video::clip_mut(&mut project, 0).generator = None;
        crate::video::clip_mut(&mut project, 0).asset_id = asset.id;
        crate::video::clip_mut(&mut project, 0).duration_ms = asset.duration_ms;
        project.assets = vec![asset];
        let mut effect = definition(&project, "beam.opacity").instantiate();
        effect.parameters.insert(
            "opacity".into(),
            Binding::Curve {
                space: TimeSpace::ClipLocal,
                keys: vec![
                    Keyframe {
                        id: Uuid::new_v4(),
                        time: Time::milliseconds(0),
                        value: Value::Number(0.),
                        interpolation: Interpolation::Linear,
                    },
                    Keyframe {
                        id: Uuid::new_v4(),
                        time: Time::milliseconds(1000),
                        value: Value::Number(1.),
                        interpolation: Interpolation::Linear,
                    },
                ],
            },
        );
        crate::video::clip_mut(&mut project, 0)
            .instances
            .push(effect);
        let original = Render::new(root.path(), &project).image(600).rgba;
        crate::video::clip_mut(&mut project, 0).source_in_ms = 400;
        crate::video::clip_mut(&mut project, 0).duration_ms -= 400;
        crate::video::clip_mut(&mut project, 0).animation_offset_ms = 400;
        assert_eq!(original, Render::new(root.path(), &project).image(200).rgba);
    });
}
