#![cfg(test)]
#![allow(clippy::unwrap_used)]
use super::*;

#[test]
fn window_types_use_the_first_recognized_basic_type() {
    let basic = [1, 2, 3];
    assert!(application_type(&[], 1, 2, &basic));
    assert!(application_type(&[99], 1, 2, &basic));
    assert!(application_type(&[99, 1], 1, 2, &basic));
    assert!(application_type(&[2, 3], 1, 2, &basic));
    assert!(!application_type(&[99, 3, 1], 1, 2, &basic));
}

#[test]
fn descriptors_keep_explicit_native_identity_and_selection_mode() {
    for kind in [SourceKind::Display, SourceKind::Window] {
        let source = descriptor("x11:window:42".into(), "Document".into(), kind, false).unwrap();
        assert_eq!(source.id.as_str(), "x11:window:42");
        assert_eq!(source.selection_mode, SourceSelectionMode::Direct);
        assert!(source.capabilities.supports_cursor_exclusion);
    }
}

#[test]
#[ignore = "requires the private X11 display"]
fn live_catalog_tracks_bounds_visibility_titles_and_closed_windows() {
    use super::super::checks::Fixture;
    use x11rb::wrapper::ConnectionExt as _;
    let fixture = Fixture::new(0xff0000);
    let id = SourceId::new(format!("x11:window:{}", fixture.window)).unwrap();
    let sources = discover_sources().unwrap();
    assert!(
        sources
            .iter()
            .any(|source| source.id == id && source.label == "X11 capture fixture")
    );
    assert_eq!(window_bounds(&id).unwrap().width, 160);
    fixture
        .connection
        .change_property32(
            x11rb::protocol::xproto::PropMode::REPLACE,
            fixture.window,
            atom(&fixture.connection, b"_NET_WM_PID").unwrap(),
            AtomEnum::CARDINAL,
            &[std::process::id()],
        )
        .unwrap();
    fixture.connection.flush().unwrap();
    assert!(
        !discover_sources()
            .unwrap()
            .iter()
            .any(|source| source.id == id)
    );
    fixture
        .connection
        .destroy_window(fixture.window)
        .unwrap()
        .check()
        .unwrap();
    assert!(window_bounds(&id).is_err());
}
