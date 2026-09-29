use super::{definition, types::Render};
use crate::fixtures::decision_mut;
use beam_editor_domain::{
    Document,
    animation::{Binding, Value},
    effects::migration,
    timing::{Time, TimeRange, TimeSpace},
};
use beam_editor_engine::{
    Project,
    video::{pipeline, probe},
};
use ges::prelude::*;
pub fn project(
    root: &std::path::Path,
    media: &std::path::Path,
    width: u32,
    height: u32,
    pattern: &str,
) -> Project {
    gst::init().unwrap();
    let path = media.join(format!("framing-{width}-{height}-{pattern}.webm"));
    let recording=gst::parse::launch(&format!("webmmux name=mux ! filesink location=\"{}\" videotestsrc num-buffers=90 pattern={pattern} ! video/x-raw,width={width},height={height},framerate=30/1 ! vp8enc deadline=1 ! mux. audiotestsrc num-buffers=141 samplesperbuffer=1024 freq=440 ! audio/x-raw,rate=48000 ! audioconvert ! vorbisenc ! mux.",path.display())).unwrap().downcast::<gst::Pipeline>().unwrap();
    recording.set_state(gst::State::Playing).unwrap();
    let message = recording
        .bus()
        .unwrap()
        .timed_pop_filtered(
            gst::ClockTime::from_seconds(10),
            &[gst::MessageType::Eos, gst::MessageType::Error],
        )
        .unwrap();
    recording.set_state(gst::State::Null).unwrap();
    assert!(
        matches!(message.view(), gst::MessageView::Eos(..)),
        "{message:?}"
    );
    let asset = probe::import(root, &path).unwrap();
    assert_eq!((asset.width, asset.height), (width, height));
    let mut project = super::project();
    decision_mut(&mut project.clips, 0).generator = None;
    decision_mut(&mut project.clips, 0).asset_id = asset.id;
    decision_mut(&mut project.clips, 0).source_in_ms = 200;
    decision_mut(&mut project.clips, 0).duration_ms = 2000;
    project.assets = vec![asset];
    project
}
fn scalar_document(mut project: Project) -> Document {
    let mut clip = decision_mut(&mut project.clips, 0);
    clip.effects.brightness = 0.12;
    clip.effects.saturation = 0.65;
    clip.effects.opacity = 0.8;
    clip.effects.volume = 0.7;
    clip.effects.scale = 1.4;
    clip.effects.x = 0.23;
    clip.effects.y = 0.72;
    clip.effects.fade_in_ms = 400;
    clip.effects.fade_out_ms = 600;
    drop(clip);
    Document::new(project)
}
fn audio(render: &Render, sink: &gst_app::AppSink, time: u64) -> (u64, Vec<f32>) {
    let (status, current, pending) = render.pipeline.state(gst::ClockTime::from_seconds(10));
    status.unwrap();
    assert_eq!(current, gst::State::Paused, "seek state at {time}");
    assert_eq!(
        pending,
        gst::State::VoidPending,
        "seek completion at {time}"
    );
    let sample = sink
        .try_pull_preroll(gst::ClockTime::from_seconds(5))
        .expect("native audio preroll");
    let buffer = sample.buffer().unwrap();
    let timestamp = buffer.pts().expect("native audio timestamp").nseconds();
    let map = buffer.map_readable().unwrap();
    let pcm = map
        .as_slice()
        .as_chunks::<4>()
        .0
        .iter()
        .map(|bytes| f32::from_le_bytes(*bytes))
        .collect();
    (timestamp, pcm)
}
#[test]
fn v1_scalar_rendering_migrates_with_identical_rgba_and_pcm_at_fade_boundaries() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut video_differences = Vec::new();
        for (width, height) in [(96, 54), (54, 96)] {
            let original =
                scalar_document(project(root.path(), media.path(), width, height, "smpte"));
            let times = [0, 200, 400, 900, 1400, 1800, 1966];
            let (render, sink) = Render::with_audio(root.path(), &original.project);
            let expected: Vec<_> = times
                .iter()
                .map(|time| {
                    let image = render.image(*time);
                    (image, audio(&render, &sink, *time))
                })
                .collect();
            drop(render);
            let mut migrated = original.clone();
            migration::migrate_document(&mut migrated).unwrap();
            let (render, sink) = Render::with_audio(root.path(), &migrated.project);
            for (time, (expected_frame, (timestamp, pcm))) in times.into_iter().zip(expected) {
                let actual_frame = render.image(time);
                assert_eq!(
                    actual_frame.position_ms, expected_frame.position_ms,
                    "video timestamp at {time}"
                );
                let image = actual_frame.rgba;
                let rgba = expected_frame.rgba;
                let changed = image
                    .iter()
                    .zip(&rgba)
                    .filter(|(actual, expected)| actual != expected)
                    .count();
                let max_byte = image
                    .iter()
                    .zip(&rgba)
                    .map(|(actual, expected)| actual.abs_diff(*expected))
                    .max()
                    .unwrap();
                let first_byte = image
                    .iter()
                    .zip(&rgba)
                    .enumerate()
                    .find(|(_, (actual, expected))| actual != expected);
                if changed != 0 {
                    video_differences.push(format!("RGBA parity {width}x{height} at {time}: {changed} bytes, max delta {max_byte}, first {first_byte:?}"));
                }
                let (actual_timestamp, actual) = audio(&render, &sink, time);
                assert_eq!(actual_timestamp, timestamp, "PCM timestamp at {time}");
                assert_eq!(actual.len(), pcm.len(), "PCM buffer shape at {time}");
                let first = actual.iter().zip(&pcm).find(|(a, b)| a != b);
                let max = actual
                    .iter()
                    .zip(&pcm)
                    .map(|(a, b)| (a - b).abs())
                    .fold(0_f32, f32::max);
                assert!(
                    first.is_none(),
                    "PCM parity at {time}: first {first:?}, max difference {max}"
                );
            }
        }
        assert!(
            video_differences.is_empty(),
            "{}",
            video_differences.join("\n")
        );
    });
}
#[test]
fn native_framing_draws_outside_the_original_viewport_and_updates_without_rebuilding() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut before = project(root.path(), media.path(), 54, 96, "red");
        let mut first = definition(&before, "beam.framing").instantiate();
        first
            .parameters
            .insert("scale".into(), Binding::constant(Value::Number(0.5)));
        first
            .parameters
            .insert("x".into(), Binding::constant(Value::Number(1.)));
        let mut second = first.duplicate();
        second
            .parameters
            .insert("x".into(), Binding::constant(Value::Number(0.)));
        second.range = Some(TimeRange {
            space: TimeSpace::ClipLocal,
            start: Time::ZERO,
            end: Time::milliseconds(500),
        });
        decision_mut(&mut before.clips, 0).instances = vec![first, second];
        let render = Render::new(root.path(), &before);
        let left = render.image(200);
        let right = render.image(900);
        assert!(super::super::recording_effects::pixel(&left, 4, 32)[0] > 240);
        assert!(
            super::super::recording_effects::pixel(&right, 60, 32)[0] > 240,
            "framing reaches past the initial source-fit viewport"
        );
        assert_eq!(right.rgba, render.image(900).rgba);
        let mut after = before.clone();
        decision_mut(&mut after.clips, 0).instances[1].range = None;
        decision_mut(&mut after.clips, 0).instances[1].enabled = false;
        assert!(pipeline::update(&render.pipeline, &before, &after).unwrap());
        assert!(
            super::super::recording_effects::pixel(&render.image(200), 60, 32)[0] > 240,
            "bypass exposes the earlier placement"
        );
    });
}
#[test]
fn migrated_history_reopens_and_undo_restores_the_original_pixels_and_source() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let original = scalar_document(project(root.path(), media.path(), 96, 54, "smpte"));
        let mut document = original.clone();
        document
            .undo
            .push(beam_editor_domain::EditState::capture(&original.project));
        decision_mut(&mut document.project.clips, 0).effects.scale = 0.55;
        decision_mut(&mut document.project.clips, 0).effects.x = 0.8;
        beam_editor_domain::timeline::sequences::synchronize(&mut document);
        let sources = document.project.assets.clone();
        migration::migrate_document(&mut document).unwrap();
        let store = beam_editor_domain::project::store::ProjectStore::lock(root.path()).unwrap();
        store.write(&document).unwrap();
        let (loaded, recovered) = store.read().unwrap();
        assert!(!recovered);
        assert_eq!(loaded.project.assets, sources);
        let undo = beam_editor_domain::timeline::history::edited(
            &loaded,
            &beam_editor_domain::Edit::Undo {},
        )
        .unwrap();
        let expected = Render::new(root.path(), &original.project).image(900).rgba;
        assert_eq!(
            Render::new(root.path(), &undo.project).image(900).rgba,
            expected
        );
    });
}
