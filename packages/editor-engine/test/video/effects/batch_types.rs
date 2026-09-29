use super::{definition, project, types::Render};
use ges::prelude::*;
#[test]
fn uniform_budget_splits_a_long_stack_without_dropping_any_instance() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = project();
        for _ in 0..17 {
            let instance = definition(&project, "beam.opacity").instantiate();
            crate::video::clip_mut(&mut project, 0)
                .instances
                .push(instance);
        }
        let render = Render::new(root.path(), &project);
        let nodes = render.pipeline.timeline().unwrap().layers()[0]
            .clips()
            .into_iter()
            .find(|c| c.name().is_some_and(|n| n.starts_with("clip-")))
            .unwrap();
        assert_eq!(nodes.top_effects().len(), 6);
        let ids = beam_editor_engine::video::effects::compiled_instances(&render.pipeline);
        assert_eq!(ids.len(), 18);
        assert!(render.center(400)[0] > 240);
    });
}
