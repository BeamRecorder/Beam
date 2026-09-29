use beam_editor_domain::{
    animation::{Binding, Value},
    effects::{definition, scope_types::ScopeTarget},
};
use beam_editor_engine::{
    export::{
        segment_types::SegmentPolicy,
        segments,
        types::{Container, VideoEncoder},
    },
    video::scoped_pipeline,
};
use ges::prelude::*;
use std::sync::{Arc, atomic::AtomicBool};

pub(super) fn pixels(path: &std::path::Path) -> Vec<[u8; 4]> {
    let uri = beam_editor_engine::video::probe::uri(path).unwrap();
    let pipeline=gst::parse::launch(&format!("uridecodebin uri={uri} ! video/x-raw(memory:GLMemory),format=RGBA,texture-target=2D ! gldownload ! video/x-raw,format=RGBA ! appsink name=frames sync=false")).unwrap().downcast::<gst::Pipeline>().unwrap();
    let sink = pipeline
        .by_name("frames")
        .unwrap()
        .downcast::<gst_app::AppSink>()
        .unwrap();
    pipeline.set_state(gst::State::Playing).unwrap();
    let mut pixels = Vec::new();
    while let Some(sample) = sink.try_pull_sample(gst::ClockTime::from_seconds(10)) {
        let caps = sample.caps().unwrap().structure(0).unwrap();
        assert_eq!(
            (
                caps.get::<i32>("width").unwrap(),
                caps.get::<i32>("height").unwrap()
            ),
            (128, 96)
        );
        let map = sample.buffer().unwrap().map_readable().unwrap();
        let i = (48 * 128 + 64) * 4;
        pixels.push(map.as_slice()[i..i + 4].try_into().unwrap());
    }
    let eos = sink.is_eos();
    let error = pipeline
        .bus()
        .unwrap()
        .pop_filtered(&[gst::MessageType::Error]);
    let factories: Vec<_> = pipeline
        .iterate_recurse()
        .into_iter()
        .flatten()
        .filter_map(|element| element.factory().map(|factory| factory.name().to_string()))
        .collect();
    pipeline.set_state(gst::State::Null).unwrap();
    assert!(error.is_none(), "scoped output decode error: {error:?}");
    assert!(eos, "scoped output video failed: {:?}", error);
    for factory in ["beamglvavp9dec", "vavp9dec", "vp9parse"] {
        assert!(
            factories.iter().any(|name| name == factory),
            "{factories:?}"
        );
    }
    assert!(!factories.iter().any(|name| name == "vp9dec"));
    pixels
}

#[cfg(target_os = "linux")]
#[test]
#[ignore = "real nested GES scope graphs, GLMemory and VA VP9 hardware export"]
fn windowed_export_processes_the_lane_mix_then_the_sequence_and_keeps_all_pcm() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = crate::video::transitions::project(root.path(), media.path());
        project.canvas.width = 128;
        project.canvas.height = 96;
        let shader = |id: &str, body: &str| {
            let mut definition = crate::video::effects::shader::extension(
                id,
                &format!(
                    "#ifdef GL_ES\nprecision mediump float;\n#endif\nvarying vec2 v_texcoord;uniform sampler2D tex;uniform float amount;void main(){{vec4 c=texture2D(tex,v_texcoord);{body}}}"
                ),
            );
            definition.targets = vec![ScopeTarget::Clip, ScopeTarget::Track, ScopeTarget::Sequence];
            definition
        };
        let threshold = shader(
            "demo.export-threshold",
            "gl_FragColor=vec4(0.0,step(amount,c.r),1.0-step(amount,c.r),c.a);",
        );
        let swap = shader(
            "demo.export-swap",
            "gl_FragColor=vec4(mix(c.rgb,c.bgr,amount),c.a);",
        );
        let mut track_shader = threshold.instantiate();
        track_shader
            .parameters
            .insert("amount".into(), Binding::constant(Value::Number(0.75)));
        crate::video::track_mut(&mut project, 0)
            .instances
            .push(track_shader);
        project.sequence_instances.push(swap.instantiate());
        project.definitions.extend([threshold, swap]);
        let mut gain = definition(&project.definitions, "beam.gain", 2)
            .unwrap()
            .instantiate();
        gain.parameters
            .insert("volume".into(), Binding::constant(Value::Number(0.5)));
        crate::video::track_mut(&mut project, 0)
            .instances
            .push(gain.clone());
        gain.id = uuid::Uuid::new_v4();
        project.sequence_instances.push(gain);
        let output = media.path().join("scoped.webm");
        let report = segments::render_with_source(
            root.path(),
            &project,
            &output,
            Container::Webm,
            VideoEncoder::new("VP9", "video/x-vp9", "vavp9enc"),
            Arc::new(AtomicBool::new(false)),
            |_| {},
            SegmentPolicy {
                window_ms: 500,
                ..Default::default()
            },
            scoped_pipeline::build_window,
        )
        .unwrap()
        .unwrap();
        assert_eq!(
            (report.segments, report.video_frames, report.audio_samples),
            (4, 60, 96000)
        );
        assert_eq!(
            report.peak_native_clips, 4,
            "each actual A/V lane decoder is counted"
        );
        let frames = pixels(&output);
        assert_eq!(frames.len(), 60);
        for index in [18, 30, 42] {
            let pixel = frames[index];
            if index == 18 {
                assert!(
                    pixel[1] > 230 && pixel[0] < 10 && pixel[2] < 10,
                    "post-track green {pixel:?}"
                );
            } else {
                assert!(
                    pixel[0] > 230 && pixel[1] < 10 && pixel[2] < 10,
                    "post-sequence swap {pixel:?}"
                );
            }
        }
        let samples = super::segments::pcm(&output);
        assert!(samples.len() >= 96000 * 2);
        assert!(
            samples.iter().all(|sample| sample.abs() < 0.3),
            "both scope gains reach the continuing encoder"
        );
        for boundary in [24000, 48000, 72000] {
            let rms = (samples[boundary * 2 - 128..boundary * 2 + 128]
                .iter()
                .map(|sample| sample * sample)
                .sum::<f32>()
                / 256.)
                .sqrt();
            assert!(
                rms > 0.025,
                "native scope source handoff has no invented silence at {boundary}"
            );
        }
    });
}
