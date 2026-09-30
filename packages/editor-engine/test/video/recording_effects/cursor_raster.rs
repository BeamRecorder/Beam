use super::{pixel, project};
use crate::video::effects::types::Render;
use beam_editor_domain::recording::style_types::CursorShape;
#[test]
fn bundled_pointer_is_upright_and_uses_its_recorded_hotspot() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = project(root.path(), media.path());
        project.recording_style.cursor.shape = CursorShape::Pointer;
        project.recording_style.cursor.size = 32.;
        project.recording_style.cursor.color = [1., 0., 0., 1.];
        project.assets[0].cursor = vec![crate::fixtures::point(0, 0.25, 0.25, None)].into();
        let frame = Render::new(root.path(), &project).image(200);
        let mut colored = vec![];
        for y in 0..64 {
            for x in 0..64 {
                let p = pixel(&frame, x, y);
                if p[0] > 100 && p[1] < 30 {
                    colored.push((x, y));
                }
            }
        }
        assert!(
            colored.len() > 20,
            "actual SVG artwork must remain visible when tinted"
        );
        assert!(
            colored.iter().all(|(x, y)| *x >= 14 && *y >= 14),
            "hotspot must be at the arrow tip"
        );
        assert!(
            colored.iter().any(|(_, y)| *y > 30),
            "pointer must extend down from its hotspot"
        );
        let folder = std::path::Path::new("/tmp/beam-editor-audit");
        std::fs::create_dir_all(folder).unwrap();
        resvg::tiny_skia::Pixmap::from_vec(
            frame.rgba.clone(),
            resvg::tiny_skia::IntSize::from_wh(frame.width, frame.height).unwrap(),
        )
        .unwrap()
        .save_png(folder.join("cursor-default.png"))
        .unwrap();
    });
}
#[test]
fn black_tint_and_captured_shape_changes_preserve_real_artwork() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = project(root.path(), media.path());
        project.recording_style.cursor.shape = CursorShape::Pointer;
        project.recording_style.cursor.size = 24.;
        project.recording_style.cursor.color = [0., 0., 0., 1.];
        let mut arrow = crate::fixtures::point(0, 0.25, 0.25, None);
        arrow.cursor_type = Some("default".into());
        let mut text = arrow.clone();
        text.time_ms = 500;
        text.cursor_type = Some("textcursor".into());
        project.assets[0].cursor = vec![arrow, text].into();
        let render = Render::new(root.path(), &project);
        let arrow = render.image(200);
        let text = render.image(600);
        assert!(arrow.rgba.chunks_exact(4).any(|p| p[0] > 100));
        assert!(text.rgba.chunks_exact(4).any(|p| p[0] > 100));
        assert_ne!(arrow.rgba, text.rgba);
        assert_eq!(arrow.rgba, render.image(200).rgba);
    });
}
#[test]
fn invalid_fixed_artwork_is_a_render_error_and_png_packs_use_original_pixels() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = project(root.path(), media.path());
        project.recording_style.cursor.shape = CursorShape::Pointer;
        project.recording_style.cursor.size = 22.;
        let packs = beam_editor_engine::video::recording_effects::cursor_catalog::packs().unwrap();
        let pack = packs
            .iter()
            .find(|p| p.cursors.iter().all(|c| c.format == "png"))
            .unwrap();
        project.recording_style.cursor.selection.pack_id = pack.id.clone();
        project.assets[0].cursor = vec![crate::fixtures::point(0, 0.25, 0.25, None)].into();
        let frame = Render::new(root.path(), &project).image(200);
        assert!(
            frame
                .rgba
                .chunks_exact(4)
                .filter(|p| p[0] > 20 || p[1] > 20 || p[2] > 20)
                .count()
                > 10
        );
        project.recording_style.cursor.selection.mode =
            beam_editor_domain::recording::cursor_style_types::SelectionMode::Fixed;
        project.recording_style.cursor.selection.cursor_id = Some("missing".into());
        let controller = beam_editor_engine::EditorController::new().unwrap();
        let document = beam_editor_engine::Document::new(project);
        std::fs::write(
            root.path().join("editor.beam.json"),
            serde_json::to_vec(&document).unwrap(),
        )
        .unwrap();
        let snapshot = controller.open(root.path().into()).unwrap();
        assert!(snapshot.transport.error.unwrap().contains("artwork"));
    });
}
