//! GES source conversions stay on the GPU while placement and audio retain GES timing.
use beam_editor_engine::video::pipeline::build;
use ges::prelude::*;
#[test]
fn shared_ges_pipeline_builds_overlays_color_volume_and_canvas_background() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let path = crate::fixtures::media(root.path(), "source.webm", true);
        let asset = beam_editor_engine::video::probe::import(root.path(), &path).unwrap();
        let mut project = crate::fixtures::project();
        project.clips[0].asset_id = asset.id;
        project.clips[0].duration_ms = 800;
        project.assets = vec![asset];
        project.canvas.background = 0xff334455;
        project.clips[0].effects.brightness = 0.2;
        project.clips[0].effects.scale = 0.5;
        project.clips[0].effects.volume = 0.5;
        project.tracks[0].muted = true;
        let pipeline = build(root.path(), &project).unwrap();
        assert_eq!(pipeline.timeline().unwrap().tracks().len(), 2);
        let factories: Vec<_> = pipeline
            .iterate_recurse()
            .into_iter()
            .flatten()
            .filter_map(|element| element.factory().map(|factory| factory.name().to_string()))
            .collect();
        for cpu in ["videoconvert", "videoscale", "videoflip"] {
            assert!(!factories.iter().any(|name| name == cpu), "{factories:?}");
        }
        pipeline.set_state(gst::State::Null).unwrap();
    });
}
