#[test]
fn disabled_cursor_never_opens_interaction_devices() {
    let directory = tempfile::tempdir().unwrap();
    let request = beam_screen::ScreenRequest {
        selection: beam_screen::model::ScreenSelection::Portal {
            kind: beam_screen::model::PortalSourceKind::Monitor,
            restore_token: None,
        },
        region: None,
        cursor: beam_screen::model::CursorSelection::Disabled,
        fps: 30,
        excluded_window_handles: vec![],
    };
    assert!(
        beam_screen::ScreenTelemetry::open(
            directory.path(),
            &request,
            beam_media_core::SessionClock::start(),
            std::sync::Arc::new(beam_media_core::StartGate::new())
        )
        .unwrap()
        .is_none()
    );
    assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 0);
}
