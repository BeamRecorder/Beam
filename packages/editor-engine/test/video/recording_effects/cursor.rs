use super::{pixel, project};
use crate::fixtures::decision_mut;
use crate::video::effects::{definition, types::Render};
use beam_editor_domain::{
    animation::{Binding, Value},
    recording::style_types::{CursorMode, CursorStyleOverride},
};
use beam_editor_engine::video::pipeline;

#[test]
fn real_cursor_overlay_uses_captured_positions_and_explicit_style_overrides() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = project(root.path(), media.path());
        let frame = Render::new(root.path(), &project).image(200);
        assert!(pixel(&frame, 48, 32)[0] > 230);
        assert!(pixel(&frame, 32, 32)[0] < 10);
        decision_mut(&mut project.clips, 0).cursor_style = Some(CursorStyleOverride {
            color: Some([0., 1., 0., 1.]),
            ..Default::default()
        });
        let frame = Render::new(root.path(), &project).image(200);
        let value = pixel(&frame, 48, 32);
        assert!(value[0] < 10 && value[1] > 230, "{value:?}");
    });
}
#[test]
fn baked_or_unknown_cursor_sources_are_never_rendered_twice_and_explicit_overlays_fail() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = project(root.path(), media.path());
        for mode in [CursorMode::BakedIn, CursorMode::Unknown, CursorMode::Absent] {
            project.assets[0].cursor_mode = mode;
            let frame = Render::new(root.path(), &project).image(200);
            assert!(pixel(&frame, 48, 32)[0] < 10);
            let instance = definition(&project, "beam.cursor").instantiate();
            decision_mut(&mut project.clips, 0).instances.push(instance);
            assert!(pipeline::build(root.path(), &project).is_err());
            decision_mut(&mut project.clips, 0).instances.clear();
        }
        project.assets[0].cursor_mode = CursorMode::Separated;
        project.assets[0].cursor = Default::default();
        let frame = Render::new(root.path(), &project).image(200);
        assert!(pixel(&frame, 48, 32)[0] < 10);
        let instance = definition(&project, "beam.cursor").instantiate();
        decision_mut(&mut project.clips, 0).instances.push(instance);
        assert!(pipeline::build(root.path(), &project).is_err());
    });
}

#[test]
fn saved_recording_with_missing_cursor_positions_opens_with_video_and_warning() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = project(root.path(), media.path());
        project.assets[0].cursor = Default::default();
        let document = beam_editor_engine::Document::new(project);
        std::fs::write(
            root.path().join("editor.beam.json"),
            serde_json::to_vec(&document).unwrap(),
        )
        .unwrap();
        let controller = beam_editor_engine::EditorController::new().unwrap();
        let snapshot = controller.open(root.path().into()).unwrap();
        assert!(snapshot.transport.error.is_none());
        assert!(
            snapshot
                .project
                .warnings
                .iter()
                .any(|warning| warning.contains("cursor positions were not captured"))
        );
        controller.seek(200).unwrap();
        assert!(
            controller.frame().is_some(),
            "captured video must remain available"
        );
        assert_eq!(
            snapshot.project.assets[0].cursor_mode,
            CursorMode::Separated
        );
    });
}
#[test]
fn cursor_style_and_opacity_changes_publish_to_the_existing_native_pipeline() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut before = project(root.path(), media.path());
        let instance = definition(&before, "beam.cursor").instantiate();
        decision_mut(&mut before.clips, 0).instances.push(instance);
        let render = Render::new(root.path(), &before);
        assert!(pixel(&render.image(200), 48, 32)[0] > 230);
        let mut after = before.clone();
        decision_mut(&mut after.clips, 0).instances[0]
            .parameters
            .insert("opacity".into(), Binding::constant(Value::Number(0.5)));
        after.recording_style.cursor.color = [0., 1., 0., 1.];
        pipeline::prepare_update(&render.pipeline, &before, &after)
            .unwrap()
            .unwrap()
            .apply();
        let value = pixel(&render.image(200), 48, 32);
        assert!(
            value[0] < 10 && value[1] > 100 && value[1] < 150,
            "{value:?}"
        );
    });
}

#[test]
fn captured_click_ring_and_automatic_hiding_are_real_gpu_pixels() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = project(root.path(), media.path());
        project.assets[0].cursor = vec![
            crate::fixtures::point(0, 0.75, 0.5, None),
            crate::fixtures::point(
                200,
                0.75,
                0.5,
                Some(beam_editor_domain::recording::types::CursorInteractionType::Click),
            ),
        ]
        .into();
        let render = Render::new(root.path(), &project);
        assert!(pixel(&render.image(100), 54, 32)[0] < 10);
        assert!(pixel(&render.image(300), 54, 32)[0] > 30);
        drop(render);
        project.recording_style.cursor.hide_after_ms = 100;
        let frame = Render::new(root.path(), &project).image(700);
        assert!(pixel(&frame, 48, 32)[0] < 10);
        assert!(pixel(&frame, 54, 32)[0] < 10);
    });
}
