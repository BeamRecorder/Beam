use beam_editor_engine::{
    Edit, EditorController,
    export::types::{Container, ExportPhase},
};
use std::time::{Duration, Instant};
mod assets;
mod presentation;
mod window;
mod window_types;
#[test]
#[ignore = "requires a hardware video encoder and OpenGL; uses no GUI"]
fn ges_import_split_seek_and_export_use_the_same_timeline() {
    let media = tempfile::tempdir().unwrap();
    let path = crate::fixtures::media(media.path(), "sample.webm", false);
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Test".into())
        .unwrap();
    let first = controller.import(vec![path]).unwrap();
    assert_eq!(first.project.clips.len(), 1);
    assert!(first.transport.error.is_none());
    let split = controller
        .edit(
            first.revision,
            Edit::Split {
                id: first.project.clips[0].id,
                time_ms: 500,
            },
        )
        .unwrap();
    assert_eq!(split.project.clips.len(), 2);
    controller.frame();
    controller.seek(750).unwrap();
    controller.transport().unwrap();
    let frame = controller.frame().expect("seek publishes a paused preview");
    assert_eq!(
        frame.rgba.len(),
        frame.width as usize * frame.height as usize * 4
    );
    let destination = media.path().join("export.webm");
    controller
        .export(destination.clone(), Container::Webm)
        .unwrap();
    let status = crate::fixtures::wait_export(&controller);
    assert_eq!(status.phase, ExportPhase::Completed, "{:?}", status.error);
    let probe = beam_editor_engine::video::probe::discover(&destination).unwrap();
    assert!(probe.has_video);
    assert!(probe.duration_ms.abs_diff(1000) <= 100);
}
#[test]
fn playback_reaches_eos_and_reseeking_restarts_the_native_composition() {
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Test".into())
        .unwrap();
    let imported = controller
        .import(vec![crate::fixtures::media(
            media.path(),
            "play.webm",
            false,
        )])
        .unwrap();
    assert!(controller.seek(imported.transport.duration_ms + 1).is_err());
    controller.seek(800).unwrap();
    controller.play(true).unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if !controller.transport().unwrap().playing {
            break;
        }
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(30));
    }
    assert_eq!(
        controller.transport().unwrap().position_ms,
        imported.transport.duration_ms
    );
    controller.seek(0).unwrap();
    assert!(controller.play(true).unwrap().playing);
    controller.play(false).unwrap();
}
#[test]
fn failed_media_rebuild_keeps_the_previous_document_and_sources() {
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Test".into())
        .unwrap();
    let imported = controller
        .import(vec![crate::fixtures::media(
            media.path(),
            "gone.webm",
            false,
        )])
        .unwrap();
    let document =
        beam_editor_engine::project::store::read_document(&root.path().join("editor.beam.json"))
            .unwrap();
    let path = root.path().join(&document.project.assets[0].path);
    let source = std::fs::read(&path).unwrap();
    std::fs::remove_file(&path).unwrap();
    assert!(
        controller
            .edit(
                imported.revision,
                Edit::Rename {
                    name: "Cannot commit".into()
                }
            )
            .is_err()
    );
    assert_eq!(controller.snapshot().unwrap().project.name, "Test");
    assert_eq!(
        beam_editor_engine::project::store::read_document(&root.path().join("editor.beam.json"))
            .unwrap()
            .revision,
        imported.revision
    );
    std::fs::write(path, source).unwrap();
    let restored = controller.retry().unwrap();
    assert_eq!(restored.revision, imported.revision);
    assert!(restored.transport.error.is_none());
}
#[test]
fn failed_compound_import_preserves_the_document_sources_and_managed_directory() {
    let root = tempfile::tempdir().unwrap();
    let media = tempfile::tempdir().unwrap();
    let controller = beam_editor_engine::EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Atomic import".into())
        .unwrap();
    let before = controller.document().unwrap();
    let valid = crate::fixtures::media(media.path(), "original.webm", false);
    let original = std::fs::read(&valid).unwrap();
    let invalid = media.path().join("invalid.webm");
    std::fs::write(&invalid, b"not media").unwrap();
    assert!(controller.import(vec![valid.clone(), invalid]).is_err());
    assert_eq!(controller.document().unwrap(), before);
    assert_eq!(std::fs::read(&valid).unwrap(), original);
    assert_eq!(
        std::fs::read_dir(root.path().join("media"))
            .unwrap()
            .count(),
        0
    );
}
