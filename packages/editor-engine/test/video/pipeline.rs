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

#[test]
fn recorded_clip_longer_than_encoded_media_still_builds_a_preview() {
    crate::fixtures::context(|| {
        let media = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        let source = super::transitions::fixture(media.path(), "recording.webm", "red", 440);
        let mut asset = beam_editor_engine::video::probe::import(root.path(), &source).unwrap();
        let encoded_duration = asset.duration_ms;
        asset.recording = true;
        asset.duration_ms += 1000;
        let mut project = crate::fixtures::project();
        let mut clip = crate::video::clip_mut(&mut project, 0);
        clip.asset_id = asset.id;
        clip.duration_ms = asset.duration_ms;
        drop(clip);
        project.assets = vec![asset];
        let render = super::effects::types::Render::new(root.path(), &project);
        let node = render.pipeline.timeline().unwrap().layers()[0].clips()[0].clone();
        assert!(node.duration().mseconds() <= encoded_duration);
        let pixel = render.center(200);
        assert!(
            pixel[0] > 200 && pixel[1] < 30 && pixel[2] < 30,
            "{pixel:?}"
        );
        drop(render);
        beam_editor_engine::project::store::ProjectStore::lock(root.path())
            .unwrap()
            .write(&beam_editor_engine::Document::new(project))
            .unwrap();
        let controller = beam_editor_engine::EditorController::new().unwrap();
        let snapshot = controller.open(root.path().into()).unwrap();
        assert!(
            snapshot.transport.error.is_none(),
            "{:?}",
            snapshot.transport.error
        );
        controller.seek(200).unwrap();
        let frame = controller.frame().unwrap();
        let center = ((frame.height / 2 * frame.width + frame.width / 2) * 4) as usize;
        assert!(
            frame.rgba[center] > 200,
            "{:?}",
            &frame.rgba[center..center + 4]
        );
    });
}

#[test]
fn linked_video_and_audio_render_the_soundtrack_once() {
    use super::effects::types::Render;
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
        let (baseline, baseline_sink) = Render::with_audio(root.path(), &project);
        let original = baseline.audio(&baseline_sink, 600);
        let mut audio = crate::video::clip_mut(&mut project, 0).clone();
        audio.id = uuid::Uuid::new_v4();
        audio.track_id = crate::video::track_mut(&mut project, 1).id;
        let group = uuid::Uuid::new_v4();
        audio.link_group = Some(group);
        crate::video::clip_mut(&mut project, 0).link_group = Some(group);
        project.clips.try_push(audio).unwrap();
        let (linked, sink) = Render::with_audio(root.path(), &project);
        let actual = linked.audio(&sink, 600);
        let rms = |samples: &[f32]| {
            (samples.iter().map(|v| f64::from(*v).powi(2)).sum::<f64>() / samples.len() as f64)
                .sqrt()
        };
        assert!(
            (rms(&original) - rms(&actual)).abs() < 0.015,
            "linked soundtrack must not be doubled"
        );
        let sources = linked
            .pipeline
            .timeline()
            .unwrap()
            .layers()
            .iter()
            .flat_map(|l| l.clips())
            .flat_map(|c| c.children(false))
            .filter(|c| c.is::<ges::AudioSource>())
            .count();
        assert_eq!(
            sources, 1,
            "only the linked audio clip owns an audio source"
        );
    });
}

#[test]
fn fractional_frame_rates_reach_the_native_track_without_rounding() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = super::effects::project();
        project.canvas.fps = 30_000;
        project.canvas.fps_denominator = 1001;
        let render = super::effects::types::Render::new(root.path(), &project);
        let video = render
            .pipeline
            .timeline()
            .unwrap()
            .tracks()
            .into_iter()
            .find(|t| t.track_type() == ges::TrackType::VIDEO)
            .unwrap();
        let caps = video.restriction_caps().unwrap();
        assert_eq!(
            caps.structure(0)
                .unwrap()
                .get::<gst::Fraction>("framerate")
                .unwrap(),
            gst::Fraction::new(30_000, 1001)
        );
        assert_eq!(render.image(201).width, 64);
    });
}
