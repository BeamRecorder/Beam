use beam_editor_engine::video::{gpu, pipeline, preview, scopes, types::FrameMailbox};
use ges::prelude::*;

#[test]
fn scopes_require_native_support_instead_of_discarding_requested_instances() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = super::effects::project();
        let opacity =
            beam_editor_domain::effects::definition(&project.definitions, "beam.opacity", 2)
                .unwrap()
                .instantiate();
        project.sequence_instances.push(opacity.clone());
        let error = pipeline::build(root.path(), &project).unwrap_err();
        assert!(error.to_string().contains("track and sequence"));
        project.sequence_instances.clear();
        super::track_mut(&mut project, 0).instances.push(opacity);
        let error = pipeline::build(root.path(), &project).unwrap_err();
        assert!(error.to_string().contains("track and sequence"));
    });
}

fn placeholder() -> (ges::Timeline, ges::TrackElement) {
    gpu::initialize().unwrap();
    let timeline = ges::Timeline::new();
    timeline.add_track(&ges::VideoTrack::new()).unwrap();
    let clip = ges::TestClip::new().unwrap();
    clip.set_supported_formats(ges::TrackType::VIDEO);
    assert!(clip.set_duration(gst::ClockTime::from_seconds(1)));
    timeline.append_layer().add_clip(&clip).unwrap();
    assert!(timeline.commit_sync());
    let source = clip
        .children(false)
        .into_iter()
        .find_map(|child| {
            child
                .downcast::<ges::TrackElement>()
                .ok()
                .filter(|element| element.is::<ges::VideoSource>())
        })
        .unwrap();
    (timeline, source)
}

#[test]
fn nested_scopes_reject_missing_or_multiple_outputs_and_existing_ownership() {
    crate::fixtures::context(|| {
        let (_outer, source) = placeholder();
        let missing = ges::Timeline::new();
        assert!(
            scopes::video_source(&source, &missing)
                .unwrap_err()
                .to_string()
                .contains("exactly one output")
        );
        let multiple = ges::Timeline::new();
        multiple.add_track(&ges::VideoTrack::new()).unwrap();
        multiple.add_track(&ges::AudioTrack::new()).unwrap();
        assert!(
            scopes::video_source(&source, &multiple)
                .unwrap_err()
                .to_string()
                .contains("exactly one output")
        );
        let owned = ges::Timeline::new();
        owned.add_track(&ges::VideoTrack::new()).unwrap();
        let owner = gst::Bin::new();
        owner.add(&owned).unwrap();
        assert!(
            scopes::video_source(&source, &owned)
                .unwrap_err()
                .to_string()
                .contains("already has an owner")
        );
        assert_eq!(owned.parent().unwrap(), owner.upcast::<gst::Object>());
        assert!(
            source
                .element()
                .unwrap()
                .downcast::<gst::Bin>()
                .unwrap()
                .iterate_recurse()
                .into_iter()
                .flatten()
                .any(|element| element
                    .factory()
                    .is_some_and(|factory| factory.name() == "videotestsrc")),
            "failed preparation retains the original producer"
        );
    });
}

#[test]
fn nested_scope_sources_can_only_be_replaced_before_preroll() {
    crate::fixtures::context(|| {
        let (_outer, source) = placeholder();
        let inner = ges::Timeline::new();
        inner.add_track(&ges::VideoTrack::new()).unwrap();
        inner.set_state(gst::State::Ready).unwrap();
        let error = scopes::video_source(&source, &inner).unwrap_err();
        inner.set_state(gst::State::Null).unwrap();
        assert!(error.to_string().contains("before preroll"));
    });
}

#[test]
#[ignore = "real nested GES video compositions and OpenGL"]
fn nested_composition_is_a_real_seekable_input_to_post_mix_effects() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let project = super::effects::project();
        let inner = pipeline::compose(root.path(), &project).unwrap();
        let timeline = ges::Timeline::new();
        let video = ges::VideoTrack::new();
        video.set_restriction_caps(
            &gst::Caps::builder("video/x-raw")
                .features(["memory:GLMemory"])
                .field("format", "RGBA")
                .field("texture-target", "2D")
                .field("width", 64_i32)
                .field("height", 64_i32)
                .field("framerate", gst::Fraction::new(30, 1))
                .build(),
        );
        timeline.add_track(&video).unwrap();
        let outer = ges::TestClip::new().unwrap();
        outer.set_supported_formats(ges::TrackType::VIDEO);
        assert!(outer.set_duration(gst::ClockTime::from_mseconds(1000)));
        timeline.append_layer().add_clip(&outer).unwrap();
        for child in outer.children(false) {
            if let Ok(source) = child.downcast::<ges::TrackElement>()
                && source.is::<ges::VideoSource>()
            {
                scopes::video_source(&source, &inner).unwrap();
            }
        }
        assert!(timeline.commit_sync());
        let pipeline = ges::Pipeline::new();
        pipeline.set_timeline(&timeline).unwrap();
        gpu::configure(&pipeline);
        let frames = std::sync::Arc::new(FrameMailbox::default());
        preview::attach(&pipeline, &project.canvas, frames.clone()).unwrap();
        pipeline.set_state(gst::State::Paused).unwrap();
        if let Err(error) = frames.wait(std::time::Duration::from_secs(10)) {
            let message = pipeline
                .bus()
                .unwrap()
                .pop_filtered(&[gst::MessageType::Error]);
            pipeline.set_state(gst::State::Null).unwrap();
            panic!("nested preroll: {error}; {message:?}");
        }
        for time in [600, 100, 200, 600] {
            frames
                .seek(&pipeline, gst::ClockTime::from_mseconds(time), 30, 1)
                .unwrap();
            if let Err(error) = frames.wait(std::time::Duration::from_secs(10)) {
                let message = pipeline
                    .bus()
                    .unwrap()
                    .pop_filtered(&[gst::MessageType::Error]);
                pipeline.set_state(gst::State::Null).unwrap();
                panic!("nested seek {time}: {error}; {message:?}");
            }
            let image = frames.take().unwrap();
            assert_eq!(image.position_ms, time);
            assert!(
                image
                    .rgba
                    .as_chunks::<4>()
                    .0
                    .iter()
                    .any(|p| p[0] > 240 && p[2] < 5)
            );
        }
        pipeline.set_state(gst::State::Null).unwrap();
    });
}
