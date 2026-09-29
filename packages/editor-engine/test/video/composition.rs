use super::{effects::types::Render, scoped_pipeline::with_pipeline};
use beam_editor_domain::{
    animation::{Binding, Value},
    effects::definition,
};
use beam_editor_engine::video::{effects, pipeline, scoped_pipeline, source_runs};
use ges::prelude::*;

fn audio() -> (gst::Bin, gst_app::AppSink) {
    gst::init().unwrap();
    let bin = gst::parse::bin_from_description(
        "audioconvert ! audioresample ! audio/x-raw,format=F32LE,rate=48000,channels=1 ! appsink name=pcm sync=false",
        true,
    ).unwrap();
    let sink = bin
        .by_name("pcm")
        .unwrap()
        .downcast::<gst_app::AppSink>()
        .unwrap();
    (bin, sink)
}

#[test]
fn canvas_fraction_fields_that_exceed_native_integers_fail_before_source_creation() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        for (fps, denominator, field) in [
            (u32::MAX, u32::MAX, "numerator"),
            (1, u32::MAX, "denominator"),
        ] {
            let mut project = super::effects::project();
            project.canvas.fps = fps;
            project.canvas.fps_denominator = denominator;
            let error = scoped_pipeline::build(root.path(), &project).unwrap_err();
            assert!(
                error
                    .to_string()
                    .contains(&format!("frame-rate {field} exceeds native budget")),
                "{error}"
            );
        }
    });
}

#[test]
#[ignore = "real scoped VA media sources, decoder reuse, GL and exact PCM"]
fn continuous_source_cuts_keep_logical_ids_and_scope_updates_keep_real_decoders() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = super::transitions::project(root.path(), media.path());
        project.transitions.clear();
        project.assets.truncate(1);
        let first = super::clip(&project, 0);
        let mut next = (*first).clone();
        next.id = uuid::Uuid::new_v4();
        next.start_ms = 1000;
        next.source_in_ms = 1500;
        project.clips = vec![(*first).clone(), next].into();
        let mut gain = definition(&project.definitions, "beam.gain", 2)
            .unwrap()
            .instantiate();
        gain.parameters
            .insert("volume".into(), Binding::constant(Value::Number(0.5)));
        super::track_mut(&mut project, 0)
            .instances
            .push(gain.clone());
        gain.id = uuid::Uuid::new_v4();
        project.sequence_instances.push(gain);
        let make = |reuse| {
            let native =
                scoped_pipeline::build_with_source_reuse(root.path(), &project, reuse).unwrap();
            let (bin, sink) = audio();
            (
                with_pipeline(native, &project, Some(bin.upcast_ref())),
                sink,
            )
        };
        let (reused, reused_audio) = make(true);
        let (explicit, explicit_audio) = make(false);
        assert_eq!(source_runs::allocated(&reused.pipeline), 2);
        assert_eq!(source_runs::allocated(&explicit.pipeline), 4);
        for time in [100, 900, 1000, 1100, 1900, 100] {
            assert_eq!(
                reused.image(time).rgba,
                explicit.image(time).rgba,
                "source cut {time}"
            );
            assert_eq!(
                reused.audio(&reused_audio, time),
                explicit.audio(&explicit_audio, time),
                "PCM cut {time}"
            );
        }
        let samples = reused.audio(&reused_audio, 1100);
        assert!(samples.iter().any(|sample| *sample != 0.));
        let decoders = super::scoped_pipeline::decoder_ids(&reused.pipeline);
        assert!(decoders.len() >= 2);
        let mut candidate = project.clone();
        candidate.sequence_instances[0]
            .parameters
            .insert("volume".into(), Binding::constant(Value::Number(1.)));
        let prepared = pipeline::prepare_update(&reused.pipeline, &project, &candidate)
            .unwrap()
            .unwrap();
        assert_eq!(
            reused.audio(&reused_audio, 1100),
            samples,
            "prepare is not publication"
        );
        prepared.apply();
        assert_eq!(
            reused.audio(&reused_audio, 1100),
            samples.iter().map(|sample| sample * 2.).collect::<Vec<_>>()
        );
        assert_eq!(
            super::scoped_pipeline::decoder_ids(&reused.pipeline),
            decoders
        );
        let window = scoped_pipeline::build_window(root.path(), &candidate, 1100, 1900).unwrap();
        let plan = pipeline::render_plan(&window).unwrap();
        assert_eq!(plan.clips.len(), 1);
        assert!(plan.clips.contains(&super::clip(&project, 1).id));
        assert_eq!(source_runs::allocated(&window), 2);
        let window = with_pipeline(window, &candidate, None);
        assert_eq!(window.image(1500).rgba, reused.image(1500).rgba);
        assert_eq!(
            project.clips.len(),
            2,
            "both logical cuts remain in the document"
        );
        super::clip_mut(&mut candidate, 1).effects.opacity = 0.5;
        assert!(
            pipeline::prepare_update(&reused.pipeline, &project, &candidate)
                .unwrap()
                .is_none(),
            "member processing requires a separate decoder run"
        );
    });
}

#[test]
#[ignore = "real native silence source and scoped audio processing without an audio asset"]
fn audio_scopes_are_compiled_for_a_video_only_document_and_keep_native_silence() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = super::effects::project();
        let gain = definition(&project.definitions, "beam.gain", 2)
            .unwrap()
            .instantiate();
        super::track_mut(&mut project, 0)
            .instances
            .push(gain.clone());
        let mut sequence_gain = gain.clone();
        sequence_gain.id = uuid::Uuid::new_v4();
        project.sequence_instances.push(sequence_gain.clone());
        let (bin, sink) = audio();
        let native = scoped_pipeline::build(root.path(), &project).unwrap();
        let render = with_pipeline(native, &project, Some(bin.upcast_ref()));
        let ids = effects::compiled_instances(&render.pipeline);
        assert!(ids.contains(&gain.id) && ids.contains(&sequence_gain.id));
        let samples = render.audio(&sink, 600);
        assert!(!samples.is_empty());
        assert!(samples.iter().all(|sample| *sample == 0.));
        assert_eq!(render.center(600), [255, 0, 0, 255]);
    });
}

#[test]
#[ignore = "real scope topology and immutable native parameter snapshots"]
fn scope_reordering_requires_a_rebuild_and_rejected_parameters_do_not_publish() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = super::effects::project();
        let opacity = definition(&project.definitions, "beam.opacity", 2).unwrap();
        project.sequence_instances = vec![opacity.instantiate(), opacity.instantiate()];
        let render: Render = super::scoped_pipeline::render(root.path(), &project);
        let before = render.image(400).rgba;
        let mut candidate = project.clone();
        candidate.sequence_instances.reverse();
        assert!(
            pipeline::prepare_update(&render.pipeline, &project, &candidate)
                .unwrap()
                .is_none()
        );
        candidate = project.clone();
        candidate.sequence_instances[0]
            .parameters
            .insert("opacity".into(), Binding::constant(Value::Number(2.)));
        assert!(pipeline::prepare_update(&render.pipeline, &project, &candidate).is_err());
        assert_eq!(render.image(400).rgba, before);
    });
}
