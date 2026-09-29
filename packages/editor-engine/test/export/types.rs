use beam_editor_engine::export::types::{Container, ExportStatus};
#[test]
fn extensions_match_typed_containers() {
    assert_eq!(Container::Mp4.extension(), "mp4");
    assert_eq!(Container::Webm.extension(), "webm");
}
#[test]
fn invalid_container_cannot_reach_a_native_render() {
    assert!(serde_json::from_str::<Container>("\"avi\"").is_err());
}
#[test]
fn idle_export_has_no_fake_progress_or_errors() {
    let value = serde_json::to_value(ExportStatus::default()).unwrap();
    assert_eq!(value["phase"], "idle");
    assert_eq!(value["progress"], 0.);
    assert!(value["error"].is_null());
}
