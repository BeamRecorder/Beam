use super::{definition, project, types::Render};
use beam_editor_domain::animation::{Binding, Value};
#[test]
fn intermediate_clamping_is_kept_when_color_operations_do_not_commute() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = project();
        for brightness in [1., -0.5] {
            let mut effect = definition(&project, "beam.color").instantiate();
            effect.parameters.insert(
                "brightness".into(),
                Binding::constant(Value::Number(brightness)),
            );
            crate::video::clip_mut(&mut project, 0)
                .instances
                .push(effect);
        }
        let first = Render::new(root.path(), &project).center(400);
        crate::video::clip_mut(&mut project, 0).instances.reverse();
        let reverse = Render::new(root.path(), &project).center(400);
        assert_ne!(
            first, reverse,
            "a fused pass must clamp each operation rather than collapse their matrices"
        );
    });
}
