use beam_editor_engine::video::{pipeline, source_runs};
use ges::prelude::*;

fn decisions() -> beam_editor_engine::Project {
    let mut project = crate::fixtures::project();
    crate::video::clip_mut(&mut project, 0).start_ms = 0;
    crate::video::clip_mut(&mut project, 0).source_in_ms = 100;
    crate::video::clip_mut(&mut project, 0).duration_ms = 20;
    let mut next = (*crate::video::clip(&project, 0)).clone();
    next.id = uuid::Uuid::new_v4();
    next.start_ms = 20;
    next.source_in_ms = 120;
    project.clips.try_push(next).unwrap();
    project
}
fn runs(project: &beam_editor_engine::Project) -> usize {
    source_runs::compile(
        project,
        project
            .clips
            .try_iter()
            .collect::<beam_editor_engine::Result<_>>()
            .unwrap(),
        true,
    )
    .unwrap()
    .len()
}

#[test]
fn only_neutral_continuous_source_intervals_share_a_decoder() {
    let project = decisions();
    assert_eq!(runs(&project), 1);
    let mut changed = project.clone();
    crate::video::clip_mut(&mut changed, 1).source_in_ms = 0;
    assert_eq!(runs(&changed), 2, "a real source jump retains the cut");
    let mut changed = project.clone();
    crate::video::clip_mut(&mut changed, 1).start_ms = 21;
    assert_eq!(runs(&changed), 2, "sequence gaps remain gaps");
    let mut changed = project.clone();
    crate::video::clip_mut(&mut changed, 1).effects.volume = 0.;
    assert_eq!(
        runs(&changed),
        2,
        "muted portions keep their own processing"
    );
    let mut changed = project.clone();
    crate::video::clip_mut(&mut changed, 1).effects.fade_in_ms = 10;
    assert_eq!(runs(&changed), 2, "clip envelopes reset at cuts");
    let mut changed = project.clone();
    crate::video::clip_mut(&mut changed, 1)
        .instances
        .push(super::effects::definition(&project, "beam.opacity").instantiate());
    assert_eq!(
        runs(&changed),
        2,
        "even neutral instances retain their scope"
    );
    let mut changed = project.clone();
    changed.assets[0].cursor_mode =
        beam_editor_domain::recording::style_types::CursorMode::Separated;
    assert_eq!(
        runs(&changed),
        2,
        "inherited cursor decisions are clip scoped"
    );
}

#[test]
fn rational_source_continuity_is_compared_without_rounding() {
    let mut project = decisions();
    let rate = beam_editor_domain::timing::Rate {
        numerator: 3,
        denominator: 2,
    };
    crate::video::clip_mut(&mut project, 0).rate = rate;
    crate::video::clip_mut(&mut project, 1).rate = rate;
    crate::video::clip_mut(&mut project, 1).source_in_ms = 130;
    assert_eq!(runs(&project), 1);
    crate::video::clip_mut(&mut project, 0).duration_ms = 21;
    crate::video::clip_mut(&mut project, 1).start_ms = 21;
    crate::video::clip_mut(&mut project, 1).source_in_ms = 132;
    assert_eq!(
        runs(&project),
        2,
        "131.5 source ms must not equal rounded 132 ms"
    );
}

#[test]
#[ignore = "real VA decoder, OpenGL and PCM source continuity"]
fn a_reused_source_run_matches_explicit_native_cuts_in_frames_and_pcm() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = super::transitions::project(root.path(), media.path());
        project.transitions.clear();
        project.assets.truncate(1);
        let first = crate::video::clip(&project, 0);
        let mut second = (*first).clone();
        second.id = uuid::Uuid::new_v4();
        second.start_ms = 1000;
        second.source_in_ms = 1500;
        project.clips = vec![(*first).clone(), second].into();
        let build = |reuse| {
            let native = pipeline::build_with_source_reuse(root.path(), &project, reuse).unwrap();
            let frames =
                std::sync::Arc::new(beam_editor_engine::video::types::FrameMailbox::default());
            beam_editor_engine::video::preview::attach(&native, &project.canvas, frames.clone())
                .unwrap();
            let bin = gst::parse::bin_from_description(
                "audioconvert ! audio/x-raw,format=F32LE,rate=48000,channels=2 ! appsink name=pcm sync=false",
                true,
            )
            .unwrap();
            let sink = bin
                .by_name("pcm")
                .unwrap()
                .downcast::<gst_app::AppSink>()
                .unwrap();
            native.preview_set_audio_sink(Some(&bin));
            native.set_state(gst::State::Paused).unwrap();
            frames.wait(std::time::Duration::from_secs(10)).unwrap();
            (
                super::effects::types::Render {
                    pipeline: native,
                    frames,
                },
                sink,
            )
        };
        let (reused, reused_audio) = build(true);
        let (explicit, explicit_audio) = build(false);
        assert_eq!(source_runs::allocated(&reused.pipeline), 1);
        assert_eq!(source_runs::allocated(&explicit.pipeline), 2);
        for time in [100, 900, 1000, 1100, 1900, 100] {
            assert_eq!(
                reused.image(time).rgba,
                explicit.image(time).rgba,
                "source cut at {time}"
            );
            assert_eq!(
                reused.audio(&reused_audio, time),
                explicit.audio(&explicit_audio, time),
                "PCM source cut at {time}"
            );
        }
        let mut edit = project.clone();
        crate::video::clip_mut(&mut edit, 1).effects.opacity = 0.5;
        assert!(
            pipeline::prepare_update(&reused.pipeline, &project, &edit)
                .unwrap()
                .is_none(),
            "editing one logical member requires its own native scope"
        );
        assert_eq!(project.clips.len(), 2);
    });
}
