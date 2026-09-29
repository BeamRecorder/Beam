use super::types::Render;
use beam_editor_domain::{
    animation::{Binding, Interpolation, Keyframe, Value},
    effects::definition,
    timing::{Rate, Time, TimeRange, TimeSpace},
};
use beam_editor_engine::video::pipeline;
use ges::prelude::*;

fn pcm(render: &Render, sink: &gst_app::AppSink, time: u64) -> (gst::ClockTime, Vec<f32>) {
    render.image(time);
    let sample = sink
        .try_pull_preroll(gst::ClockTime::from_seconds(5))
        .unwrap();
    let buffer = sample.buffer().unwrap();
    let pts = buffer.pts().unwrap();
    let map = buffer.map_readable().unwrap();
    (
        pts,
        map.as_slice()
            .as_chunks::<4>()
            .0
            .iter()
            .map(|bytes| f32::from_le_bytes(*bytes))
            .collect(),
    )
}

#[test]
#[ignore = "real retimed sources and native post-mix audio curves/ranges"]
fn audio_scope_curves_use_sequence_time_after_retiming_and_half_open_ranges() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = crate::video::transitions::project(root.path(), media.path());
        project.transitions.clear();
        for id in project
            .clips
            .headers()
            .map(|clip| clip.id)
            .collect::<Vec<_>>()
        {
            project.clips.try_by_id_mut(id).unwrap().unwrap().rate = Rate {
                numerator: 3,
                denominator: 2,
            };
        }
        let (reference, reference_audio) = Render::with_audio(root.path(), &project);
        let mut gain = definition(&project.definitions, "beam.gain", 2)
            .unwrap()
            .instantiate();
        gain.parameters.insert(
            "volume".into(),
            Binding::Curve {
                space: TimeSpace::Sequence,
                keys: vec![
                    Keyframe {
                        id: uuid::Uuid::new_v4(),
                        time: Time::milliseconds(0),
                        value: Value::Number(0.25),
                        interpolation: Interpolation::Linear,
                    },
                    Keyframe {
                        id: uuid::Uuid::new_v4(),
                        time: Time::milliseconds(1000),
                        value: Value::Number(0.75),
                        interpolation: Interpolation::Linear,
                    },
                ],
            },
        );
        gain.range = Some(TimeRange {
            space: TimeSpace::Sequence,
            start: Time::milliseconds(500),
            end: Time::milliseconds(750),
        });
        crate::video::track_mut(&mut project, 0)
            .instances
            .push(gain);
        let mut final_gain = definition(&project.definitions, "beam.gain", 2)
            .unwrap()
            .instantiate();
        final_gain
            .parameters
            .insert("volume".into(), Binding::constant(Value::Number(0.5)));
        final_gain.range = Some(TimeRange {
            space: TimeSpace::Sequence,
            start: Time::milliseconds(500),
            end: Time::milliseconds(600),
        });
        project.sequence_instances.push(final_gain);
        let bin = gst::parse::bin_from_description("audioconvert ! audioresample ! audio/x-raw,format=F32LE,rate=48000,channels=1 ! appsink name=pcm sync=false", true).unwrap();
        let sink = bin
            .by_name("pcm")
            .unwrap()
            .downcast::<gst_app::AppSink>()
            .unwrap();
        let scoped =
            crate::video::scoped_pipeline::with_sink(root.path(), &project, Some(bin.upcast_ref()));
        for (time, factor) in [
            (100, 1.),
            (500, 0.25),
            (625, 0.5625),
            (750, 1.),
            (500, 0.25),
        ] {
            let (expected_pts, reference) = pcm(&reference, &reference_audio, time);
            let (pts, samples) = pcm(&scoped, &sink, time);
            assert_eq!(pts, expected_pts);
            assert_eq!(pts, gst::ClockTime::from_mseconds(time));
            assert_eq!(samples.len(), reference.len());
            assert!(reference.iter().any(|sample| *sample != 0.));
            assert_eq!(
                samples,
                reference
                    .iter()
                    .map(|sample| sample * factor)
                    .collect::<Vec<_>>(),
                "scoped PCM at {time}"
            );
        }
        let mut candidate = project.clone();
        crate::video::track_mut(&mut candidate, 0).instances[0].enabled = false;
        candidate.sequence_instances[0].enabled = false;
        pipeline::prepare_update(&scoped.pipeline, &project, &candidate)
            .unwrap()
            .unwrap()
            .apply();
        assert_eq!(
            pcm(&scoped, &sink, 500),
            pcm(&reference, &reference_audio, 500)
        );
    });
}
