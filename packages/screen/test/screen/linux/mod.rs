#[test]
fn absent_portal_and_pipewire_disable_screen_routes() {
    let status = beam_screen::screen::linux::evaluate_capabilities(Default::default(), false, true);
    assert!(!status.recording_available);
    assert!(!status.display_capture);
    assert!(!status.window_capture);
    assert!(!status.portal_selection);
}
