use super::{pixel, project};
use crate::video::effects::types::Render;
use beam_editor_domain::{
    animation::{Binding, Value},
    recording::types::CursorInteractionType,
};
#[test]
fn repeated_half_opacity_frames_do_not_modify_the_cached_sprite() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = project(root.path(), media.path());
        let mut effect = crate::video::effects::definition(&project, "beam.cursor").instantiate();
        effect
            .parameters
            .insert("opacity".into(), Binding::constant(Value::Number(0.5)));
        crate::fixtures::decision_mut(&mut project.clips, 0)
            .instances
            .push(effect);
        let render = Render::new(root.path(), &project);
        for time in [200, 400, 200, 800, 400] {
            let p = pixel(&render.image(time), 48, 32);
            assert!((120..=135).contains(&p[0]), "{p:?}");
        }
    });
}
#[test]
fn captured_left_and_right_clicks_use_their_own_effect_colors() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = project(root.path(), media.path());
        project.assets[0].cursor = vec![
            crate::fixtures::point(0, 0.5, 0.5, None),
            crate::fixtures::point(200, 0.5, 0.5, Some(CursorInteractionType::Click)),
            crate::fixtures::point(1000, 0.5, 0.5, Some(CursorInteractionType::RightClick)),
        ]
        .into();
        for effect in [
            &mut project.recording_style.cursor.click_effects.left,
            &mut project.recording_style.cursor.click_effects.right,
        ] {
            effect.ripple_enabled = true;
            effect.ripple_size = 10.;
            effect.spring_enabled = false;
        }
        project
            .recording_style
            .cursor
            .click_effects
            .left
            .ripple_color = [1., 0., 0., 1.];
        project
            .recording_style
            .cursor
            .click_effects
            .right
            .ripple_color = [0., 0., 1., 1.];
        let render = Render::new(root.path(), &project);
        let left = pixel(&render.image(300), 39, 32);
        let right = pixel(&render.image(1100), 39, 32);
        assert!(left[0] > 100 && left[2] < 10, "{left:?}");
        assert!(right[2] > 100 && right[0] < 10, "{right:?}");
    });
}
#[test]
fn click_spring_shrinks_then_returns_to_the_recorded_size() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = project(root.path(), media.path());
        project.recording_style.cursor.size = 24.;
        project
            .recording_style
            .cursor
            .click_effects
            .left
            .spring_enabled = true;
        project
            .recording_style
            .cursor
            .click_effects
            .left
            .spring_intensity = 100.;
        project.assets[0].cursor = vec![
            crate::fixtures::point(0, 0.5, 0.5, None),
            crate::fixtures::point(200, 0.5, 0.5, Some(CursorInteractionType::Click)),
        ]
        .into();
        let render = Render::new(root.path(), &project);
        let area = |time| {
            render
                .image(time)
                .rgba
                .chunks_exact(4)
                .filter(|p| p[0] > 100)
                .count()
        };
        let before = area(100);
        assert!(area(270) < before);
        assert_eq!(area(800), before);
    });
}
