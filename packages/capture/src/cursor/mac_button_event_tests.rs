use super::*;
use crate::cursor::{CursorInteractionType, telemetry::TelemetryBuilder};

const REGION: CaptureRegion = CaptureRegion {
    x: -1000,
    y: 200,
    width: 2000,
    height: 1000,
};

#[test]
fn preserves_a_complete_trackpad_tap_between_two_polling_ticks() -> Result<(), CaptureError> {
    let mut telemetry = TelemetryBuilder::default();
    for (kind, session_ns) in [(1, 1_001_000_000), (2, 1_002_000_000)] {
        let event = mac_button_event(kind, 0, session_ns, -500, 950, REGION)?;
        assert!(event.is_some());
        if let Some(event) = event {
            telemetry.push(&event);
        }
    }
    let points = telemetry.finish().samples;
    assert_eq!(points.len(), 2);
    assert_eq!(
        points[0].interaction_type,
        Some(CursorInteractionType::Click)
    );
    assert_eq!(
        points[1].interaction_type,
        Some(CursorInteractionType::Mouseup)
    );
    assert_eq!((points[0].time_ms, points[1].time_ms), (1001, 1002));
    assert_eq!((points[0].cx, points[0].cy), (0.25, 0.75));
    Ok(())
}

#[test]
fn preserves_event_positions_across_a_drag_instead_of_using_the_last_sample()
-> Result<(), CaptureError> {
    for (kind, x, y, expected_x, expected_y) in [(1, -600, 500, 0.2, 0.3), (2, 600, 900, 0.8, 0.7)]
    {
        assert!(matches!(
            mac_button_event(kind, 0, 10, x, y, REGION)?,
            Some(CursorEvent::Button { normalized_x, normalized_y, .. })
                if normalized_x == expected_x && normalized_y == expected_y
        ));
    }
    Ok(())
}

#[test]
fn maps_left_right_and_middle_press_and_release_to_portable_buttons() -> Result<(), CaptureError> {
    for (down, up, native, portable) in [(1, 2, 0, 1), (3, 4, 1, 2), (25, 26, 2, 3)] {
        for (kind, expected_pressed) in [(down, true), (up, false)] {
            assert!(matches!(
                mac_button_event(kind, native, 123, 0, 700, REGION)?,
                Some(CursorEvent::Button { session_ns: 123, button, pressed, .. })
                    if button == portable && pressed == expected_pressed
            ));
        }
    }
    Ok(())
}

#[test]
fn ignores_movement_keyboard_and_unsupported_auxiliary_buttons() -> Result<(), CaptureError> {
    for (kind, button) in [(5, 0), (6, 0), (10, 0), (25, 3), (26, -1)] {
        assert!(mac_button_event(kind, button, 0, 0, 0, REGION)?.is_none());
    }
    Ok(())
}

#[test]
fn retains_outside_positions_without_clamping_them_to_an_invented_center()
-> Result<(), CaptureError> {
    for (x, y, expected_x, expected_y) in [(-1500, 100, -0.25, -0.1), (1500, 1300, 1.25, 1.1)] {
        assert!(matches!(
            mac_button_event(1, 0, 42, x, y, REGION)?,
            Some(CursorEvent::Button { normalized_x, normalized_y, .. })
                if normalized_x == expected_x && normalized_y == expected_y
        ));
    }
    Ok(())
}

#[test]
fn rejects_empty_capture_geometry_for_each_supported_button() {
    for kind in [1, 2, 3, 4, 25, 26] {
        for region in [
            CaptureRegion { width: 0, ..REGION },
            CaptureRegion {
                height: 0,
                ..REGION
            },
        ] {
            assert!(mac_button_event(kind, 2, 0, 0, 0, region).is_err());
        }
    }
}
