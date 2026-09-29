use beam_editor_domain::recording::style_types::{CursorMode, CursorStyleOverride, RecordingStyle};
#[test]
fn defaults_are_honest_versioned_profiles_and_empty_overrides() {
    assert_eq!(CursorMode::default(), CursorMode::Unknown);
    assert_eq!(RecordingStyle::default().version, 1);
    assert_eq!(CursorStyleOverride::default().enabled, None);
}
