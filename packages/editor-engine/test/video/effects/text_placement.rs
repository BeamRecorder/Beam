use super::{definition, types::Render};
use crate::fixtures::{decision, decision_mut};
use beam_editor_domain::{
    Document,
    animation::{Binding, Interpolation, Keyframe, Value},
    effects::migration,
    timing::{Time, TimeRange, TimeSpace},
};
use beam_editor_engine::{Project, video::pipeline};
use ges::prelude::*;
fn project() -> Project {
    let mut project = super::project();
    project.canvas.width = 320;
    project.canvas.height = 180;
    let mut clip = decision_mut(&mut project.clips, 0);
    clip.generator = None;
    clip.title = Some(beam_editor_engine::timeline::title_types::Title {
        text: "Beam".into(),
        size: 15.,
        shadow: true,
        ..Default::default()
    });
    clip.effects.x = 0.2;
    clip.effects.y = 0.8;
    clip.effects.scale = 0.7;
    clip.effects.opacity = 0.75;
    clip.effects.fade_in_ms = 100;
    clip.effects.fade_out_ms = 200;
    drop(clip);
    project
}
#[test]
fn migrated_title_placement_keeps_the_exact_pango_pixels_and_ignored_legacy_scale() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let original = Document::new(project());
        let times = [0, 200, 500, 900];
        let render = Render::new(root.path(), &original.project);
        for layer in render.pipeline.timeline().unwrap().layers() {
            for clip in layer.clips() {
                for child in clip.children(false) {
                    if let Ok(source) = child.downcast::<ges::TrackElement>()
                        && let Some(bin) =
                            source.element().and_then(|e| e.downcast::<gst::Bin>().ok())
                    {
                        for overlay in bin
                            .iterate_recurse()
                            .into_iter()
                            .flatten()
                            .filter(|e| e.factory().is_some_and(|f| f.name() == "textoverlay"))
                        {
                            let caps = overlay
                                .static_pad("video_sink")
                                .unwrap()
                                .current_caps()
                                .unwrap();
                            let structure = caps.structure(0).unwrap();
                            assert_eq!(structure.get::<i32>("width").unwrap(), 320);
                            assert_eq!(structure.get::<i32>("height").unwrap(), 180);
                        }
                    }
                }
            }
        }
        let expected: Vec<_> = times.iter().map(|t| render.image(*t).rgba).collect();
        assert!(
            expected[1]
                .as_chunks::<4>()
                .0
                .iter()
                .any(|pixel| pixel[0] > 80 && pixel[1] > 80 && pixel[2] > 80),
            "baseline Pango must draw real glyphs"
        );
        drop(render);
        let mut converted = original.clone();
        migration::migrate_document(&mut converted).unwrap();
        assert_eq!(
            decision(&converted.project.clips, 0).effects.scale,
            0.7,
            "V1 scale was unused for title layout"
        );
        let render = Render::new(root.path(), &converted.project);
        for (time, rgba) in times.into_iter().zip(expected) {
            assert!(
                render.image(time).rgba == rgba,
                "native Pango parity at {time}"
            );
        }
    });
}
#[test]
fn animated_title_layout_is_seek_independent_and_parameter_updates_apply_to_the_same_frame() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut before = project();
        decision_mut(&mut before.clips, 0).effects.x = 0.5;
        decision_mut(&mut before.clips, 0).effects.y = 0.5;
        let mut first = definition(&before, "beam.textPlacement").instantiate();
        first.parameters.insert(
            "x".into(),
            Binding::Curve {
                space: TimeSpace::ClipLocal,
                keys: [(0, 0.1), (1000, 0.6)]
                    .into_iter()
                    .map(|(time, x)| Keyframe {
                        id: uuid::Uuid::new_v4(),
                        time: Time::milliseconds(time),
                        value: Value::Number(x),
                        interpolation: Interpolation::Linear,
                    })
                    .collect(),
            },
        );
        let mut second = first.duplicate();
        second
            .parameters
            .insert("x".into(), Binding::constant(Value::Number(0.8)));
        second.range = Some(TimeRange {
            space: TimeSpace::ClipLocal,
            start: Time::milliseconds(500),
            end: Time::milliseconds(1000),
        });
        decision_mut(&mut before.clips, 0).instances = vec![first, second];
        let render = Render::new(root.path(), &before);
        let attached = beam_editor_engine::video::effects::compiled_instances(&render.pipeline);
        let expected_ids = decision(&before.clips, 0)
            .instances
            .iter()
            .map(|instance| instance.id)
            .collect::<Vec<_>>();
        assert_eq!(
            attached, expected_ids,
            "diagnostics include the real Pango source hook"
        );
        let early = render.image(200).rgba;
        assert!(
            early != render.image(400).rgba,
            "the first position curve moves the actual Pango glyphs"
        );
        let late = render.image(700).rgba;
        assert!(
            early != late,
            "real glyph position changes across the layout region"
        );
        assert!(
            early == render.image(200).rgba,
            "early glyphs survive reverse seek"
        );
        let mut after = before.clone();
        decision_mut(&mut after.clips, 0).instances[1].enabled = false;
        decision_mut(&mut after.clips, 0).instances[0]
            .parameters
            .insert("x".into(), Binding::constant(Value::Number(0.7)));
        assert!(pipeline::update(&render.pipeline, &before, &after).unwrap());
        let actual = render.image(700).rgba;
        let mut expected = project();
        decision_mut(&mut expected.clips, 0).effects.x = 0.7;
        decision_mut(&mut expected.clips, 0).effects.y = 0.5;
        assert!(
            actual == Render::new(root.path(), &expected).image(700).rgba,
            "position changes before this frame's rasterization"
        );
    });
}
#[test]
fn native_layout_rejects_processors_on_incompatible_sources() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut media = super::project();
        let instance = definition(&media, "beam.textPlacement").instantiate();
        decision_mut(&mut media.clips, 0).instances.push(instance);
        assert!(pipeline::build(root.path(), &media).is_err());
        let mut title = project();
        let instance = definition(&title, "beam.framing").instantiate();
        decision_mut(&mut title.clips, 0).instances.push(instance);
        assert!(pipeline::build(root.path(), &title).is_err());
    });
}
