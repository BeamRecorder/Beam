#[test]
fn two_input_transitions_keep_the_native_composition_in_gl_memory() {
    use ges::prelude::*;
    crate::fixtures::context(|| {
        let media = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        let project = super::super::transitions::project(root.path(), media.path());
        let pipeline = beam_editor_engine::video::pipeline::build(root.path(), &project).unwrap();
        let factories: Vec<_> = pipeline
            .iterate_recurse()
            .into_iter()
            .flatten()
            .filter_map(|e| e.factory().map(|f| f.name().to_string()))
            .collect();
        for cpu in ["videoconvert", "videoscale", "smptealpha"] {
            assert!(!factories.iter().any(|f| f == cpu), "{factories:?}");
        }
        pipeline.set_state(gst::State::Null).unwrap();
    });
}
