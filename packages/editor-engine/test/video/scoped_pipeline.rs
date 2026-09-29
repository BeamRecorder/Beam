use super::effects::{shader, types::Render};
use beam_editor_domain::{
    animation::{Binding, Value},
    effects::{definition, scope_types::ScopeTarget},
};
use beam_editor_engine::{
    Project,
    video::{pipeline, preview, scoped_pipeline, types::FrameMailbox},
};
use ges::prelude::*;
use std::sync::Arc;

pub(super) fn render(root: &std::path::Path, project: &Project) -> Render {
    with_sink(root, project, None)
}
pub(super) fn with_sink(
    root: &std::path::Path,
    project: &Project,
    audio: Option<&gst::Element>,
) -> Render {
    let pipeline = scoped_pipeline::build(root, project).unwrap();
    with_pipeline(pipeline, project, audio)
}
pub(super) fn with_pipeline(
    pipeline: ges::Pipeline,
    project: &Project,
    audio: Option<&gst::Element>,
) -> Render {
    let frames = Arc::new(FrameMailbox::default());
    preview::attach(&pipeline, &project.canvas, frames.clone()).unwrap();
    if let Some(audio) = audio {
        pipeline.preview_set_audio_sink(Some(audio));
    } else if project.assets.iter().any(|asset| asset.has_audio) {
        let sink = gst::ElementFactory::make("fakesink").build().unwrap();
        pipeline.preview_set_audio_sink(Some(&sink));
    } else {
        pipeline
            .set_mode(ges::PipelineFlags::VIDEO_PREVIEW)
            .unwrap();
    }
    pipeline.set_state(gst::State::Paused).unwrap();
    if let Err(error) = frames.wait(std::time::Duration::from_secs(20)) {
        let message = pipeline
            .bus()
            .unwrap()
            .pop_filtered(&[gst::MessageType::Error]);
        pipeline.set_state(gst::State::Null).unwrap();
        panic!("scoped preroll:{error};{message:?}");
    }
    Render { pipeline, frames }
}
fn threshold(project: &mut Project) -> beam_editor_domain::effects::Instance {
    let mut definition = shader::extension(
        "demo.scope-threshold",
        "#ifdef GL_ES\nprecision mediump float;\n#endif\nvarying vec2 v_texcoord;uniform sampler2D tex;uniform float amount;void main(){vec4 c=texture2D(tex,v_texcoord);gl_FragColor=vec4(0.0,step(amount,c.r),1.0-step(amount,c.r),c.a);}",
    );
    definition.targets = vec![ScopeTarget::Clip, ScopeTarget::Track, ScopeTarget::Sequence];
    let mut instance = definition.instantiate();
    instance
        .parameters
        .insert("amount".into(), Binding::constant(Value::Number(0.75)));
    project.definitions.push(definition);
    instance
}

#[test]
#[ignore = "real nested video/audio GES scopes and GL"]
fn a_track_shader_consumes_the_crossfade_mix_once_and_scope_edits_keep_decoders() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = super::transitions::project(root.path(), media.path());
        let effect = threshold(&mut project);
        super::track_mut(&mut project, 0)
            .instances
            .push(effect.clone());
        let render = render(root.path(), &project);
        let before = render.center(600);
        let middle = render.center(1000);
        let after = render.center(1400);
        assert!(before[1] > 240 && before[2] < 10, "{before:?}");
        assert!(
            middle[2] > 240 && middle[1] < 10,
            "post-mix threshold {middle:?}"
        );
        assert!(after[2] > 240 && after[1] < 10, "{after:?}");
        assert_eq!(middle, render.center(1000));
        let mut per_clip = project.clone();
        super::track_mut(&mut per_clip, 0).instances.clear();
        for id in per_clip
            .clips
            .headers()
            .map(|clip| clip.id)
            .collect::<Vec<_>>()
        {
            per_clip
                .clips
                .try_by_id_mut(id)
                .unwrap()
                .unwrap()
                .instances
                .push({
                    let mut i = effect.clone();
                    i.id = uuid::Uuid::new_v4();
                    i
                });
        }
        let per_clip_pixel = Render::new(root.path(), &per_clip).center(1000);
        assert!(
            per_clip_pixel[1] > 80 && per_clip_pixel[2] > 80,
            "per-input threshold {per_clip_pixel:?}"
        );
        let mut candidate = project.clone();
        super::track_mut(&mut candidate, 0).instances[0]
            .parameters
            .insert("amount".into(), Binding::constant(Value::Number(0.25)));
        let update = pipeline::prepare_update(&render.pipeline, &project, &candidate)
            .unwrap()
            .unwrap();
        assert_eq!(render.center(1000), middle, "prepare does not publish");
        let decoders = decoder_ids(&render.pipeline);
        assert!(decoders.len() >= 2, "both media sources own real decoders");
        update.apply();
        assert_eq!(
            decoders,
            decoder_ids(&render.pipeline),
            "parameter publication keeps native decoders"
        );
        let changed = render.center(1000);
        assert!(
            changed[1] > 240 && changed[2] < 10,
            "live scope parameter {changed:?}"
        );
        assert_eq!(changed, render.center(1000));
    });
}

pub(super) fn decoder_ids(pipeline: &ges::Pipeline) -> Vec<usize> {
    let mut ids: Vec<_> = pipeline
        .iterate_recurse()
        .into_iter()
        .flatten()
        .filter(|element| {
            element.factory().is_some_and(|factory| {
                factory
                    .metadata("klass")
                    .is_some_and(|class| class.contains("Decoder"))
            })
        })
        .map(|element| element.as_ptr() as usize)
        .collect();
    ids.sort_unstable();
    ids
}

#[test]
#[ignore = "real OpenGL post-mix alpha composition"]
fn a_neutral_track_stack_preserves_clip_alpha_and_sequence_alpha_is_final() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = super::effects::project();
        super::clip_mut(&mut project, 0).effects.opacity = 0.5;
        let baseline = Render::new(root.path(), &project).center(400);
        let opacity = definition(&project.definitions, "beam.opacity", 2)
            .unwrap()
            .instantiate();
        super::track_mut(&mut project, 0)
            .instances
            .push(opacity.clone());
        let neutral = render(root.path(), &project).center(400);
        assert_eq!(baseline, neutral, "neutral lane {baseline:?} / {neutral:?}");
        let mut final_alpha = opacity;
        final_alpha.id = uuid::Uuid::new_v4();
        final_alpha
            .parameters
            .insert("opacity".into(), Binding::constant(Value::Number(0.5)));
        project.sequence_instances.push(final_alpha);
        let pixel = render(root.path(), &project).center(400);
        assert_eq!(pixel[0], baseline[0]);
        assert!(
            (i16::from(pixel[3]) - 128).abs() <= 1,
            "sequence alpha {pixel:?}"
        );
    });
}

#[test]
#[ignore = "native nested GES audio mixes"]
fn track_and_sequence_gains_process_real_pcm_and_updates_preserve_its_clock() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = super::transitions::project(root.path(), media.path());
        let (baseline, sink) = Render::with_audio(root.path(), &project);
        let samples = baseline.audio(&sink, 600);
        assert!(samples.iter().any(|sample| sample.abs() > 0.1));
        drop(baseline);
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
        let bin=gst::parse::bin_from_description("audioconvert ! audioresample ! audio/x-raw,format=F32LE,rate=48000,channels=1 ! appsink name=scope_audio sync=false",true).unwrap();
        let sink = bin
            .by_name("scope_audio")
            .unwrap()
            .downcast::<gst_app::AppSink>()
            .unwrap();
        let render = with_sink(root.path(), &project, Some(bin.upcast_ref()));
        let actual = render.audio(&sink, 600);
        assert_eq!(actual.len(), samples.len());
        assert!(
            actual.iter().zip(&samples).all(|(a, b)| *a == *b * 0.25),
            "scope gains keep exact PCM and timestamps"
        );
        let mut candidate = project.clone();
        candidate.sequence_instances[0]
            .parameters
            .insert("volume".into(), Binding::constant(Value::Number(1.)));
        pipeline::prepare_update(&render.pipeline, &project, &candidate)
            .unwrap()
            .unwrap()
            .apply();
        let actual = render.audio(&sink, 600);
        assert!(actual.iter().zip(&samples).all(|(a, b)| *a == *b * 0.5));
        let mut muted = candidate.clone();
        super::track_mut(&mut muted, 0).muted = true;
        pipeline::prepare_update(&render.pipeline, &candidate, &muted)
            .unwrap()
            .unwrap()
            .apply();
        assert!(render.audio(&sink, 600).iter().all(|value| *value == 0.));
    });
}

#[test]
#[ignore = "native GL sequence ordering and scope fusion"]
fn sequence_processors_follow_order_and_a_hundred_instances_are_all_compiled() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = super::effects::project();
        let mut transform = definition(&project.definitions, "beam.transform", 2)
            .unwrap()
            .instantiate();
        transform
            .parameters
            .insert("x".into(), Binding::constant(Value::Number(0.5)));
        let mut green = shader::extension(
            "demo.scope-green",
            "#ifdef GL_ES\nprecision mediump float;\n#endif\nvarying vec2 v_texcoord;uniform sampler2D tex;uniform float amount;void main(){gl_FragColor=vec4(0.0,amount,0.0,1.0);}",
        );
        green.targets = vec![ScopeTarget::Clip, ScopeTarget::Track, ScopeTarget::Sequence];
        let instance = green.instantiate();
        project.definitions.push(green);
        project.sequence_instances = vec![transform.clone(), instance.clone()];
        let forward = render(root.path(), &project).image(400);
        project.sequence_instances.reverse();
        let reversed = render(root.path(), &project).image(400);
        let pixel = |image: &beam_editor_engine::PreviewFrame, x: usize| {
            image.rgba[(32 * 64 + x) * 4..(32 * 64 + x) * 4 + 4].to_vec()
        };
        assert!(pixel(&forward, 8)[1] > 240);
        assert_eq!(pixel(&reversed, 8), vec![0, 0, 0, 0]);
        assert!(pixel(&reversed, 56)[1] > 240);
        let opacity = definition(&project.definitions, "beam.opacity", 2).unwrap();
        project.sequence_instances = (0..100).map(|_| opacity.instantiate()).collect();
        let render = render(root.path(), &project);
        let ids = beam_editor_engine::video::effects::compiled_instances(&render.pipeline);
        for instance in &project.sequence_instances {
            assert!(ids.contains(&instance.id));
        }
        let passes = render
            .pipeline
            .iterate_recurse()
            .into_iter()
            .flatten()
            .filter(|element| {
                element
                    .factory()
                    .is_some_and(|factory| factory.name() == "glshader")
            })
            .count();
        assert!(
            passes < 25,
            "homogeneous scope stack retains fused surfaces: {passes}"
        );
        assert!(render.center(400)[0] > 240);
    });
}

#[test]
#[ignore = "real GL scoped sequence clocks, curves and half-open ranges"]
fn scoped_curves_ranges_and_bypass_follow_absolute_sequence_time() {
    use beam_editor_domain::{
        animation::{Interpolation, Keyframe},
        timing::{Time, TimeRange, TimeSpace},
    };
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = super::effects::project();
        let mut opacity = definition(&project.definitions, "beam.opacity", 2)
            .unwrap()
            .instantiate();
        opacity.parameters.insert(
            "opacity".into(),
            Binding::Curve {
                space: TimeSpace::Sequence,
                keys: vec![
                    Keyframe {
                        id: uuid::Uuid::new_v4(),
                        time: Time::milliseconds(0),
                        value: Value::Number(1.),
                        interpolation: Interpolation::Linear,
                    },
                    Keyframe {
                        id: uuid::Uuid::new_v4(),
                        time: Time::milliseconds(1000),
                        value: Value::Number(0.5),
                        interpolation: Interpolation::Linear,
                    },
                ],
            },
        );
        opacity.range = Some(TimeRange {
            space: TimeSpace::Sequence,
            start: Time::milliseconds(200),
            end: Time::milliseconds(800),
        });
        super::track_mut(&mut project, 0).instances.push(opacity);
        let mut final_opacity = definition(&project.definitions, "beam.opacity", 2)
            .unwrap()
            .instantiate();
        final_opacity
            .parameters
            .insert("opacity".into(), Binding::constant(Value::Number(0.5)));
        final_opacity.range = Some(TimeRange {
            space: TimeSpace::Sequence,
            start: Time::milliseconds(400),
            end: Time::milliseconds(600),
        });
        project.sequence_instances.push(final_opacity);
        let render = render(root.path(), &project);
        let middle = render.center(400);
        assert!(
            (i16::from(middle[0]) - 204).abs() <= 1,
            "track curve {middle:?}"
        );
        assert!(
            (i16::from(middle[3]) - 128).abs() <= 1,
            "sequence range begins exactly {middle:?}"
        );
        let end = render.center(600);
        assert!((i16::from(end[0]) - 179).abs() <= 1, "track curve {end:?}");
        assert_eq!(end[3], 255, "half-open sequence range ends exactly");
        assert_eq!(
            render.center(800),
            [255, 0, 0, 255],
            "track range ends exactly"
        );
        assert_eq!(
            render.center(100),
            [255, 0, 0, 255],
            "track range has not begun"
        );
        assert_eq!(
            render.center(400),
            middle,
            "curve seeks are independent of history"
        );
        let mut candidate = project.clone();
        super::track_mut(&mut candidate, 0).instances[0].enabled = false;
        pipeline::prepare_update(&render.pipeline, &project, &candidate)
            .unwrap()
            .unwrap()
            .apply();
        assert_eq!(render.center(400), [255, 0, 0, 128]);
        candidate.sequence_instances[0].enabled = false;
        pipeline::prepare_update(&render.pipeline, &project, &candidate)
            .unwrap()
            .unwrap()
            .apply();
        assert_eq!(render.center(400), [255, 0, 0, 255]);
    });
}

#[test]
#[ignore = "native post-lane visibility gate including opaque external shaders"]
fn hidden_track_gates_a_shader_after_its_native_lane_mix() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = super::effects::project();
        let mut opaque = shader::extension(
            "demo.opaque-track",
            "#ifdef GL_ES\nprecision mediump float;\n#endif\nvarying vec2 v_texcoord;uniform sampler2D tex;uniform float amount;void main(){gl_FragColor=vec4(0.0,amount,0.0,1.0);}",
        );
        opaque.targets = vec![ScopeTarget::Clip, ScopeTarget::Track, ScopeTarget::Sequence];
        super::track_mut(&mut project, 0)
            .instances
            .push(opaque.instantiate());
        project.definitions.push(opaque);
        let render = render(root.path(), &project);
        assert!(render.center(400)[1] > 240);
        let mut hidden = project.clone();
        super::track_mut(&mut hidden, 0).hidden = true;
        pipeline::prepare_update(&render.pipeline, &project, &hidden)
            .unwrap()
            .unwrap()
            .apply();
        assert_eq!(render.center(400), [0, 0, 0, 255]);
        pipeline::prepare_update(&render.pipeline, &hidden, &project)
            .unwrap()
            .unwrap()
            .apply();
        assert!(render.center(400)[1] > 240);
    });
}
