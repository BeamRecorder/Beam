use super::effects::types::Render;
use beam_editor_domain::timing::Rate;

#[test]
fn real_rate_effects_change_media_consumption_without_changing_logical_duration() {
    use beam_editor_engine::{Canvas, video::probe};
    crate::fixtures::context(|| {
        let media = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        let source = crate::fixtures::media(media.path(), "rate.webm", true);
        let asset = probe::import(root.path(), &source).unwrap();
        let mut project = super::effects::project();
        project.canvas = Canvas::from_source(asset.width, asset.height);
        crate::video::clip_mut(&mut project, 0).generator = None;
        crate::video::clip_mut(&mut project, 0).asset_id = asset.id;
        crate::video::clip_mut(&mut project, 0).duration_ms = 400;
        crate::video::clip_mut(&mut project, 0).source_in_ms = 100;
        project.assets = vec![asset];
        let mut reference = project.clone();
        crate::video::clip_mut(&mut reference, 0).duration_ms = 800;
        let normal_render = Render::new(root.path(), &reference);
        let normal = normal_render.image(200).rgba;
        crate::video::clip_mut(&mut project, 0).rate = Rate {
            numerator: 2,
            denominator: 1,
        };
        let fast = Render::new(root.path(), &project);
        let actual = fast.image(100).rgba;
        assert_eq!(
            normal, actual,
            "double rate consumes the frame at twice sequence time after a trim"
        );
        assert!(normal != fast.image(200).rgba);
        fast.image(50);
        assert_eq!(actual, fast.image(100).rgba);
    });
}
#[test]
fn unsupported_audio_rate_is_an_explicit_backend_error() {
    crate::fixtures::context(|| {
        let media = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        let mut project = super::transitions::project(root.path(), media.path());
        project.transitions.clear();
        let first_id = project.clips.headers().next().unwrap().id;
        project
            .clips
            .try_retain(|clip| clip.id == first_id)
            .unwrap();
        crate::video::clip_mut(&mut project, 0).duration_ms = 100;
        crate::video::clip_mut(&mut project, 0).rate = Rate {
            numerator: 11,
            denominator: 1,
        };
        let error = beam_editor_engine::video::pipeline::build(root.path(), &project)
            .unwrap_err()
            .to_string();
        assert!(error.contains("audio backend supports rates"), "{error}");
    });
}
