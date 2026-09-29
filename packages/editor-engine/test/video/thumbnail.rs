use beam_editor_engine::{EditorController, video::types::PreviewQuality};

#[test]
fn full_half_and_quarter_preserve_source_canvas_and_undo_history() {
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Quality".into())
        .unwrap();
    let snapshot = controller
        .import(vec![crate::fixtures::media(
            media.path(),
            "quality.webm",
            false,
        )])
        .unwrap();
    for (quality, dimensions) in [
        (PreviewQuality::Full, (320, 180)),
        (PreviewQuality::Half, (160, 90)),
        (PreviewQuality::Quarter, (80, 45)),
    ] {
        let next = controller.preview_quality(quality).unwrap();
        controller.seek(300).unwrap();
        let frame = controller.frame().unwrap();
        assert_eq!((frame.width, frame.height), dimensions);
        assert_eq!(next.revision, snapshot.revision);
        assert_eq!(next.project.canvas.width, 320);
    }
}
#[test]
fn source_thumbnail_is_bounded_and_does_not_replace_transport_or_composition() {
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Thumbnail".into())
        .unwrap();
    let snapshot = controller
        .import(vec![crate::fixtures::media(
            media.path(),
            "thumb.webm",
            false,
        )])
        .unwrap();
    controller.seek(500).unwrap();
    let frame = controller
        .thumbnail(snapshot.project.assets[0].id.to_string())
        .unwrap();
    assert_eq!((frame.width, frame.height), (256, 144));
    assert!(!frame.rgba.is_empty());
    assert_eq!(controller.transport().unwrap().position_ms, 500);
    assert_eq!(controller.snapshot().unwrap().revision, snapshot.revision);
    assert!(controller.thumbnail("invalid-id".into()).is_err());
    assert!(
        controller
            .thumbnail(uuid::Uuid::new_v4().to_string())
            .is_err()
    );
}
