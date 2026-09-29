use super::{pixel, project};
use crate::fixtures::{decision, decision_mut};
use crate::video::effects::{definition, types::Render};
use beam_editor_domain::{
    Document, Edit,
    animation::{Binding, Value},
    timeline::history,
    timing::{Time, TimeRange, TimeSpace},
};
use beam_editor_engine::video::pipeline;

fn zoom(project: &mut beam_editor_engine::Project) {
    let mut zoom = definition(project, "beam.camera.zoom").instantiate();
    zoom.range = Some(TimeRange {
        space: TimeSpace::Source,
        start: Time::ZERO,
        end: Time::milliseconds(3000),
    });
    for (key, value) in [
        ("entryMs", Value::Number(0.)),
        ("exitMs", Value::Number(0.)),
        ("followCursor", Value::Boolean(false)),
        ("center", Value::Point([0.75, 0.5])),
    ] {
        zoom.parameters.insert(key.into(), Binding::constant(value));
    }
    decision_mut(&mut project.clips, 0).instances.push(zoom);
}
#[test]
fn real_gpu_zoom_and_cursor_are_synchronized_after_random_seeks_split_and_undo() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = project(root.path(), media.path());
        zoom(&mut project);
        let render = Render::new(root.path(), &project);
        let first = render.image(200);
        assert!(
            pixel(&first, 32, 32)[0] > 230,
            "camera must move the captured cursor to center"
        );
        render.image(2200);
        assert_eq!(first.rgba, render.image(200).rgba);
        drop(render);
        let document = Document::new(project);
        let split = history::edited(
            &document,
            &Edit::Split {
                id: decision(&document.project.clips, 0).id,
                time_ms: 1500,
            },
        )
        .unwrap();
        let render = Render::new(root.path(), &split.project);
        assert_eq!(first.rgba, render.image(1700).rgba);
        drop(render);
        let undo = history::edited(&split, &Edit::Undo {}).unwrap();
        assert_eq!(
            first.rgba,
            Render::new(root.path(), &undo.project).image(200).rgba
        );
    });
}
#[test]
fn zoom_parameter_update_keeps_the_pipeline_and_moves_real_pixels() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut before = project(root.path(), media.path());
        zoom(&mut before);
        let render = Render::new(root.path(), &before);
        assert!(render.center(200)[0] > 230);
        let mut after = before.clone();
        decision_mut(&mut after.clips, 0).instances[0]
            .parameters
            .insert("center".into(), Binding::constant(Value::Point([0.5, 0.5])));
        let prepared = pipeline::prepare_update(&render.pipeline, &before, &after)
            .unwrap()
            .unwrap();
        prepared.apply();
        assert!(render.center(200)[0] < 10);
        let frame = render.image(200);
        assert!(pixel(&frame, 62, 32)[0] > 150);
    });
}
#[test]
fn a_legacy_migration_preserves_real_frames_at_entry_pan_and_exit() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut original = project(root.path(), media.path());
        decision_mut(&mut original.clips, 0).effects.auto_zoom = true;
        original.assets[0].zooms = vec![beam_editor_domain::recording::types::Zoom {
            start_ms: 300,
            end_ms: 1400,
            cx: 0.75,
            cy: 0.5,
            scale: 2.,
        }]
        .into();
        let legacy = Render::new(root.path(), &original);
        let times = [100, 600, 1200, 1900, 2500];
        let expected: Vec<_> = times
            .into_iter()
            .map(|time| legacy.image(time).rgba)
            .collect();
        drop(legacy);
        let mut document = Document::new(original);
        beam_editor_domain::recording::decisions::migrate_document(&mut document).unwrap();
        let migrated = Render::new(root.path(), &document.project);
        for (time, expected) in times.into_iter().zip(expected) {
            assert_eq!(expected, migrated.image(time).rgba, "V1 frame at {time}ms");
        }
    });
}
