#[test]
fn permission_snapshot_has_explicit_screen_state() {
    // macOS enumeration can show a consent dialog, so its native gate runs separately.
    #[cfg(not(target_os = "macos"))]
    assert!(beam_screen::permissions().screen.is_some());
}
