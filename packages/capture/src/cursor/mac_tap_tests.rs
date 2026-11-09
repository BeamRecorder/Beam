use std::cell::Cell;

use super::restore_mouse_tap;
use crate::{
    CaptureError,
    cursor::{
        CaptureRegion, CursorInteractionType, mac_button_event::mac_button_event,
        telemetry_from_events,
    },
};

#[test]
fn stale_disable_notification_does_not_stop_a_live_tap() -> Result<(), CaptureError> {
    let checked_permission = Cell::new(false);
    let enabled = Cell::new(false);
    let restored = restore_mouse_tap(
        || {
            checked_permission.set(true);
            false
        },
        || true,
        || enabled.set(true),
    )?;
    assert!(!restored);
    assert!(!checked_permission.get());
    assert!(!enabled.get());
    Ok(())
}

#[test]
fn disabled_tap_is_reenabled_when_permission_is_still_granted() -> Result<(), CaptureError> {
    let enabled = Cell::new(false);
    assert!(restore_mouse_tap(
        || true,
        || enabled.get(),
        || enabled.set(true)
    )?);
    assert!(enabled.get());
    Ok(())
}

#[test]
fn revoked_permission_is_actionable_and_never_reenables_the_tap() {
    let attempted = Cell::new(false);
    let result = restore_mouse_tap(|| false, || false, || attempted.set(true));
    assert!(
        matches!(result, Err(CaptureError::PermissionDenied(ref message))
        if message.contains("Input Monitoring") && message.contains("System Settings"))
    );
    assert!(!attempted.get());
}

#[test]
fn failed_reenable_reports_the_native_listener_failure() {
    let attempted = Cell::new(false);
    let result = restore_mouse_tap(|| true, || false, || attempted.set(true));
    assert!(matches!(result, Err(CaptureError::Backend(ref message))
        if message.contains("remained disabled") && message.contains("Input Monitoring granted")));
    assert!(attempted.get());
}

#[test]
fn repeated_temporary_disables_do_not_poison_later_mouse_and_trackpad_clicks()
-> Result<(), CaptureError> {
    let enabled = Cell::new(false);
    let region = CaptureRegion {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
    };
    let mut events = Vec::new();
    for time in 1..=3 {
        enabled.set(false);
        assert!(restore_mouse_tap(
            || true,
            || enabled.get(),
            || enabled.set(true)
        )?);
        for kind in [1, 2] {
            if let Some(event) = mac_button_event(kind, 0, time * 1_000_000, 480, 540, region)? {
                events.push(event);
            }
        }
    }
    let points = telemetry_from_events(&events).samples;
    assert_eq!(points.len(), 6);
    assert_eq!(
        points
            .iter()
            .filter(|p| matches!(
                p.interaction_type,
                Some(CursorInteractionType::Click | CursorInteractionType::DoubleClick)
            ))
            .count(),
        3
    );
    assert!(points.iter().all(|p| p.cx == 0.25 && p.cy == 0.5));
    Ok(())
}
