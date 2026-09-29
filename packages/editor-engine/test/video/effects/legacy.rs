use super::{project, types::Render};
use beam_editor_engine::video::pipeline::update;

#[test]
fn legacy_color_alpha_and_fade_controls_update_without_rebuilding() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let before = project();
        let render = Render::new(root.path(), &before);
        let mut after = before.clone();
        crate::video::clip_mut(&mut after, 0).effects.opacity = 0.5;
        crate::video::clip_mut(&mut after, 0).effects.fade_in_ms = 1000;
        assert!(update(&render.pipeline, &before, &after).unwrap());
        assert!((i16::from(render.center(500)[0]) - 64).abs() <= 3);
        crate::video::track_mut(&mut after, 0).hidden = true;
        assert!(update(&render.pipeline, &before, &after).unwrap());
        assert!(render.center(700)[0] < 5);
    });
}
