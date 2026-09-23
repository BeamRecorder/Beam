#![cfg(test)]
#![allow(clippy::unwrap_used)]
#[test]
fn invalid_window_identifiers_are_rejected_without_starting_capture() {
    for raw in ["screen:1", "wgc:window:invalid", "wgc:window:0", "window:0"] {
        let id = crate::model::SourceId::new(raw).unwrap();
        assert!(super::window_from_source_id(&id).is_err());
    }
    assert!(
        super::backend_error("lost")
            .to_string()
            .contains("Windows Graphics Capture: lost")
    );
}
