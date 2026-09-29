use beam_editor_engine::video::pipeline::build;
use ges::prelude::*;
#[test]
fn missing_source_and_invalid_project_fail_before_timeline_publication() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = crate::fixtures::project();
        assert!(build(root.path(), &project).is_err());
        project.canvas.width = 0;
        assert!(build(root.path(), &project).is_err());
    });
}
#[test]
fn empty_timeline_can_be_constructed_without_fake_sources() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let pipeline = build(
            root.path(),
            &beam_editor_engine::Project::new("Empty".into()),
        )
        .unwrap();
        assert_eq!(pipeline.timeline().unwrap().tracks().len(), 1);
        pipeline.set_state(gst::State::Null).unwrap();
    });
}
