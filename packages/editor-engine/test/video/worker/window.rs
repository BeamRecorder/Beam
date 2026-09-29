use beam_editor_engine::domain::effects::definition;
use beam_editor_engine::{Document, EditorController, project::store::ProjectStore};

#[test]
#[ignore = "requires OpenGL and native decoding; uses no GUI"]
fn distant_seeks_load_only_their_render_window_and_preserve_document_revision() {
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let source = crate::fixtures::media(media.path(), "window.webm", false);
    let controller = EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Window".into())
        .unwrap();
    let imported = controller.import(vec![source]).unwrap();
    let mut document = controller.document().unwrap();
    drop(controller);
    let original = (*crate::fixtures::clip(&document.project, 0)).clone();
    document.project.clips = Default::default();
    for index in 0..10000 {
        let mut clip = original.clone();
        clip.id = uuid::Uuid::new_v4();
        clip.start_ms = index * 1000;
        clip.instances.push(
            definition(&document.project.definitions, "beam.opacity", 1)
                .unwrap()
                .instantiate(),
        );
        document.project.clips.try_push(clip).unwrap();
    }
    document = Document::new(document.project);
    document.revision = imported.revision;
    ProjectStore::lock(root.path())
        .unwrap()
        .write(&document)
        .unwrap();
    let controller = EditorController::new().unwrap();
    let opened = controller.open(root.path().into()).unwrap();
    assert!(
        opened.transport.error.is_none(),
        "{:?}",
        opened.transport.error
    );
    for position in [9_999_500, 500, 5_000_500, 500] {
        controller.seek(position).unwrap();
        assert!(controller.frame().is_some());
        assert_eq!(controller.snapshot().unwrap().revision, imported.revision);
    }
    assert_eq!(controller.document().unwrap().project.clips.len(), 10000);
}

#[test]
#[ignore = "requires OpenGL and native decoding; uses no GUI"]
fn playing_across_a_preload_boundary_keeps_the_clock_and_revision() {
    use std::time::{Duration, Instant};
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Preload".into())
        .unwrap();
    let imported = controller
        .import(vec![crate::fixtures::media(
            media.path(),
            "preload.webm",
            false,
        )])
        .unwrap();
    let mut project = controller.document().unwrap().project;
    drop(controller);
    let original = (*crate::fixtures::clip(&project, 0)).clone();
    project.clips = Default::default();
    for index in 0..60 {
        let mut clip = original.clone();
        clip.id = uuid::Uuid::new_v4();
        clip.start_ms = index * 1000;
        project.clips.try_push(clip).unwrap();
    }
    let mut document = Document::new(project);
    document.revision = imported.revision;
    ProjectStore::lock(root.path())
        .unwrap()
        .write(&document)
        .unwrap();
    let controller = EditorController::new().unwrap();
    controller.open(root.path().into()).unwrap();
    controller.seek(21_500).unwrap();
    controller.play(true).unwrap();
    let deadline = Instant::now() + Duration::from_secs(12);
    let mut previous = 21_500;
    let mut max_request = Duration::ZERO;
    loop {
        let started = Instant::now();
        let transport = controller.transport().unwrap();
        max_request = max_request.max(started.elapsed());
        assert!(transport.error.is_none(), "{:?}", transport.error);
        assert!(transport.playing);
        assert!(
            transport.position_ms >= previous,
            "clock went backwards: {previous} -> {}",
            transport.position_ms
        );
        previous = transport.position_ms;
        if previous >= 25_000 {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "playback did not cross the preload boundary"
        );
        std::thread::sleep(Duration::from_millis(100));
    }
    controller.play(false).unwrap();
    assert_eq!(controller.document().unwrap().revision, imported.revision);
    assert!(controller.frame().is_some());
    eprintln!(
        "preload handoff: final={previous}ms max transport request={}ms",
        max_request.as_millis()
    );
}
