use crate::CaptureError;

use super::{CaptureRegion, CursorEvent, map_coordinates};

/// Translate Quartz mouse transitions, preserving each event's own position.
pub(crate) fn mac_button_event(
    event_type: u32,
    native_button: i64,
    session_ns: u64,
    x: i32,
    y: i32,
    region: CaptureRegion,
) -> Result<Option<CursorEvent>, CaptureError> {
    let (button, pressed) = match event_type {
        1 => (1, true), // kCGEventLeftMouseDown
        2 => (1, false),
        3 => (2, true), // kCGEventRightMouseDown
        4 => (2, false),
        25 if native_button == 2 => (3, true), // kCGEventOtherMouseDown
        26 if native_button == 2 => (3, false),
        _ => return Ok(None),
    };
    let position = map_coordinates(x, y, region)?;
    Ok(Some(CursorEvent::Button {
        session_ns,
        button,
        pressed,
        normalized_x: position.normalized_x,
        normalized_y: position.normalized_y,
    }))
}

#[cfg(test)]
#[path = "mac_button_event_tests.rs"]
mod tests;
