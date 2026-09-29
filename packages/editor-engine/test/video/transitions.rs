use super::effects::{definition, types::Render};
use beam_editor_domain::effects::Transition;
use beam_editor_engine::{Canvas, Project, video::probe};
use ges::prelude::*;

pub fn fixture(
    root: &std::path::Path,
    name: &str,
    color: &str,
    frequency: u32,
) -> std::path::PathBuf {
    gst::init().unwrap();
    let path = root.join(name);
    let pipeline = gst::parse::launch(&format!("webmmux name=mux ! filesink location=\"{}\" videotestsrc num-buffers=90 pattern={color} ! video/x-raw,width=64,height=64,framerate=30/1 ! vp8enc deadline=1 ! mux. audiotestsrc num-buffers=141 samplesperbuffer=1024 freq={frequency} ! audio/x-raw,rate=48000 ! audioconvert ! vorbisenc ! mux.",path.display()))
        .unwrap().downcast::<gst::Pipeline>().unwrap();
    pipeline.set_state(gst::State::Playing).unwrap();
    let message = pipeline
        .bus()
        .unwrap()
        .timed_pop_filtered(
            gst::ClockTime::from_seconds(10),
            &[gst::MessageType::Eos, gst::MessageType::Error],
        )
        .unwrap();
    pipeline.set_state(gst::State::Null).unwrap();
    assert!(
        matches!(message.view(), gst::MessageView::Eos(..)),
        "{message:?}"
    );
    path
}
pub fn project(root: &std::path::Path, media: &std::path::Path) -> Project {
    let mut project = super::effects::project();
    project.canvas = Canvas {
        width: 64,
        height: 64,
        background: 0xff000000,
        ..Canvas::default()
    };
    let mut first = probe::import(root, &fixture(media, "red.webm", "red", 440)).unwrap();
    let mut second = probe::import(root, &fixture(media, "blue.webm", "blue", 880)).unwrap();
    first.name = "Red".into();
    second.name = "Blue".into();
    crate::video::clip_mut(&mut project, 0).generator = None;
    crate::video::clip_mut(&mut project, 0).asset_id = first.id;
    crate::video::clip_mut(&mut project, 0).source_in_ms = 500;
    let mut to = crate::video::clip_mut(&mut project, 0).clone();
    to.id = uuid::Uuid::new_v4();
    to.asset_id = second.id;
    to.start_ms = 1000;
    let transition = Transition {
        from_clip: crate::video::clip(&project, 0).id,
        to_clip: to.id,
        duration_ms: 400,
        instance: definition(&project, "beam.crossfade").instantiate(),
    };
    project.clips.try_push(to).unwrap();
    project.assets = vec![first, second];
    project.transitions.push(transition);
    project
}

#[test]
fn two_real_media_inputs_mix_during_the_native_video_and_audio_crossfade() {
    crate::fixtures::context(|| {
        let media = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        let project = project(root.path(), media.path());
        let render = Render::new(root.path(), &project);
        let before = render.center(600);
        let middle = render.center(1000);
        let after = render.center(1400);
        assert!(before[0] > 240 && before[2] < 10, "{before:?}");
        assert!(
            (i16::from(middle[0]) - 128).abs() <= 15 && (i16::from(middle[2]) - 128).abs() <= 15,
            "both sources must be present at the cut: {middle:?}"
        );
        assert!(after[2] > 240 && after[0] < 10, "{after:?}");
        let transitions: Vec<_> = render.pipeline.timeline().unwrap().layers()[0]
            .clips()
            .into_iter()
            .filter(|clip| clip.is::<ges::TransitionClip>())
            .collect();
        assert_eq!(transitions.len(), 1);
        assert!(
            transitions[0]
                .children(false)
                .iter()
                .any(|child| child.is::<ges::AudioTransition>())
        );
        assert_eq!(middle, render.center(1000));
    });
}
#[test]
fn an_external_transition_definition_uses_the_same_real_two_input_backend() {
    crate::fixtures::context(|| {
        let media = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        let mut project = project(root.path(), media.path());
        let mut extension = definition(&project, "beam.crossfade").clone();
        extension.id = "demo.crossfade".into();
        extension.label = "Demo transition".into();
        project.transitions[0].instance = extension.instantiate();
        project.definitions.push(extension);
        let pixel = Render::new(root.path(), &project).center(1000);
        assert!(pixel[0] > 90 && pixel[2] > 90, "{pixel:?}");
    });
}

#[test]
fn a_crossfade_preserves_both_inputs_partial_opacity() {
    crate::fixtures::context(|| {
        let media = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        let mut project = project(root.path(), media.path());
        let ids: Vec<_> = project.clips.headers().map(|clip| clip.id).collect();
        for id in ids {
            project
                .clips
                .try_by_id_mut(id)
                .unwrap()
                .unwrap()
                .effects
                .opacity = 0.5;
        }
        let pixel = Render::new(root.path(), &project).center(1000);
        assert!(
            (i16::from(pixel[0]) - 64).abs() <= 10 && (i16::from(pixel[2]) - 64).abs() <= 10,
            "both opacities must survive the nested compositor: {pixel:?}"
        );
    });
}

#[test]
fn wipe_transition_has_two_distinct_inputs_on_opposite_sides_of_the_frame() {
    crate::fixtures::context(|| {
        let media = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        let mut project = project(root.path(), media.path());
        project.transitions[0].instance = definition(&project, "beam.wipe").instantiate();
        let frame = Render::new(root.path(), &project).image(1000);
        let left = &frame.rgba[(32 * 64 + 8) * 4..(32 * 64 + 8) * 4 + 3];
        let right = &frame.rgba[(32 * 64 + 56) * 4..(32 * 64 + 56) * 4 + 3];
        assert!(
            (left[2] > 240 && right[0] > 240) || (left[0] > 240 && right[2] > 240),
            "two-input wipe: {left:?}, {right:?}"
        );
    });
}

#[test]
fn audio_crossfade_contains_both_sources_at_the_cut() {
    crate::fixtures::context(|| {
        let media = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        let project = project(root.path(), media.path());
        let (render, sink) = Render::with_audio(root.path(), &project);
        let before = render.audio(&sink, 600);
        let middle = render.audio(&sink, 1000);
        let after = render.audio(&sink, 1400);
        let strength = |samples: &[f32], frequency: f64| {
            let mut real = 0.;
            let mut imaginary = 0.;
            for (i, sample) in samples.iter().enumerate() {
                let angle = std::f64::consts::TAU * frequency * i as f64 / 48000.;
                real += f64::from(*sample) * angle.cos();
                imaginary += f64::from(*sample) * angle.sin();
            }
            2. * real.hypot(imaginary) / samples.len() as f64
        };
        let red = strength(&before, 440.);
        let blue = strength(&after, 880.);
        let red_mid = strength(&middle, 440.);
        let blue_mid = strength(&middle, 880.);
        assert!(
            red > 0.5 && blue > 0.5,
            "missing real source audio {red}, {blue}"
        );
        assert!(
            (red_mid / red - 0.5).abs() < 0.15 && (blue_mid / blue - 0.5).abs() < 0.15,
            "audio crossfade levels {red_mid}/{red}, {blue_mid}/{blue}"
        );
    });
}
