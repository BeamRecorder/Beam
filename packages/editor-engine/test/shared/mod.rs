use beam_editor_engine::EditorError;
#[test]
fn storage_failures_retain_path_and_cause() {
    let error = beam_editor_engine::shared::storage(
        "project/editor.beam.json",
        std::io::Error::from(std::io::ErrorKind::PermissionDenied),
    );
    assert!(error.to_string().contains("editor.beam.json"));
    assert!(matches!(error, EditorError::Storage { .. }));
}
#[test]
fn malformed_json_is_a_typed_boundary_error() {
    let error = serde_json::from_str::<beam_editor_engine::Document>("{").unwrap_err();
    let error = EditorError::from(error);
    assert!(matches!(error, EditorError::Json(_)));
}
#[test]
fn media_and_stopped_errors_are_readable() {
    assert!(
        EditorError::Media("missing decoder".into())
            .to_string()
            .contains("missing decoder")
    );
    assert!(!EditorError::Stopped.to_string().is_empty());
}
