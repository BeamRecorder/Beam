use beam_editor_engine::{EditorController, video::types::PreviewQuality};
#[test]
fn unopened_thumbnail_and_quality_commands_fail_without_creating_a_document() {
    let controller = EditorController::new().unwrap();
    assert!(controller.preview_quality(PreviewQuality::Full).is_err());
    assert!(
        controller
            .thumbnail(uuid::Uuid::new_v4().to_string())
            .is_err()
    );
    assert!(!controller.transport().unwrap().playing);
}
