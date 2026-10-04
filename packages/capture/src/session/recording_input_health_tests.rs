use super::requested_input_error;
use crate::input::{InputAccessError, InputAccessStatus};
use crate::model::CursorSelection;

fn cursor(clicks: bool, shortcuts: bool) -> CursorSelection {
    CursorSelection::Separate {
        capture_clicks: clicks,
        capture_shortcuts: shortcuts,
        capture_shape: true,
    }
}

#[test]
fn disabled_and_embedded_cursor_capture_do_not_require_input_access() {
    for cursor in [
        CursorSelection::Disabled,
        CursorSelection::Embedded,
        cursor(false, false),
    ] {
        assert!(requested_input_error(&cursor, &InputAccessStatus::required()).is_none());
    }
}

#[test]
fn healthy_idle_input_access_does_not_require_any_click_event() {
    assert!(
        requested_input_error(
            &cursor(true, true),
            &InputAccessStatus::available(Some(1), Some(1))
        )
        .is_none()
    );
}

#[test]
fn loss_of_either_requested_device_is_reported() {
    for status in [
        InputAccessStatus::available(Some(0), Some(1)),
        InputAccessStatus::available(Some(1), Some(0)),
    ] {
        assert!(requested_input_error(&cursor(true, true), &status).is_some());
    }
}

#[test]
fn devices_not_requested_by_the_recording_do_not_cause_failures() {
    assert!(
        requested_input_error(
            &cursor(true, false),
            &InputAccessStatus::available(Some(1), Some(0))
        )
        .is_none()
    );
    assert!(
        requested_input_error(
            &cursor(false, true),
            &InputAccessStatus::available(Some(0), Some(1))
        )
        .is_none()
    );
}

#[test]
fn revoked_or_stopped_input_access_is_reported() {
    for status in [
        InputAccessStatus::required(),
        InputAccessStatus::installation_required(),
        InputAccessStatus::unavailable(),
    ] {
        assert!(requested_input_error(&cursor(true, false), &status).is_some());
    }
}

#[test]
fn a_native_diagnostic_is_preserved_including_its_code() {
    let diagnostic = InputAccessError {
        code: "input-stream-stalled".into(),
        message: "No event or heartbeat arrived.".into(),
    };
    let status = InputAccessStatus {
        error: Some(diagnostic.clone()),
        ..InputAccessStatus::unavailable()
    };
    assert_eq!(
        requested_input_error(&cursor(true, true), &status),
        Some(diagnostic)
    );
}
