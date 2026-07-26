use objc2::rc::autoreleasepool;
use objc2_app_kit::{NSCursor, NSCursorFrameResizeDirections, NSCursorFrameResizePosition};

use crate::cursor::{CursorKind, Hotspot};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct MacCursorShape {
    pub cursor_id: String,
    pub cursor_kind: CursorKind,
    pub native_cursor_id: String,
    pub hotspot: Hotspot,
}

/// Reads the system-wide cursor from AppKit on the cursor recording thread.
///
/// `currentSystemCursor` is the only AppKit API that exposes the cursor drawn
/// by another application. It can return `nil`, so that case remains explicit
/// as an unknown cursor instead of pretending it is the arrow cursor.
#[allow(deprecated)]
pub(crate) fn current_system_shape() -> MacCursorShape {
    autoreleasepool(|| match NSCursor::currentSystemCursor() {
        Some(cursor) => descriptor_for(&cursor),
        None => custom_descriptor(0, Hotspot { x: 0, y: 0 }),
    })
}

fn descriptor_for(cursor: &NSCursor) -> MacCursorShape {
    let hotspot = hotspot(cursor);
    match classify(cursor) {
        Some(kind) => system_descriptor(kind, hotspot),
        None => custom_descriptor(cursor as *const NSCursor as usize, hotspot),
    }
}

fn system_descriptor(cursor_kind: CursorKind, hotspot: Hotspot) -> MacCursorShape {
    let name = portable_name(cursor_kind);
    let native_cursor_id = format!("macos:{name}");
    MacCursorShape {
        cursor_id: native_cursor_id.clone(),
        cursor_kind,
        native_cursor_id,
        hotspot,
    }
}

fn custom_descriptor(pointer: usize, hotspot: Hotspot) -> MacCursorShape {
    let native_cursor_id = format!("macos:cursor:{pointer:x}");
    MacCursorShape {
        cursor_id: native_cursor_id.clone(),
        cursor_kind: CursorKind::Custom,
        native_cursor_id,
        hotspot,
    }
}

fn classify(cursor: &NSCursor) -> Option<CursorKind> {
    standard_cursors()
        .into_iter()
        .find_map(|(kind, standard)| (cursor == &*standard).then_some(kind))
}

fn standard_cursors() -> Vec<(CursorKind, objc2::rc::Retained<NSCursor>)> {
    let all_directions = NSCursorFrameResizeDirections::All;
    vec![
        (CursorKind::Default, NSCursor::arrowCursor()),
        (CursorKind::Textcursor, NSCursor::IBeamCursor()),
        (
            CursorKind::Textcursor,
            NSCursor::IBeamCursorForVerticalLayout(),
        ),
        (CursorKind::Handpointing, NSCursor::pointingHandCursor()),
        (CursorKind::Handpointing, NSCursor::openHandCursor()),
        (CursorKind::Handpointing, NSCursor::closedHandCursor()),
        (CursorKind::Handpointing, NSCursor::dragCopyCursor()),
        (CursorKind::Handpointing, NSCursor::dragLinkCursor()),
        (CursorKind::Cross, NSCursor::crosshairCursor()),
        (
            CursorKind::Notallowed,
            NSCursor::operationNotAllowedCursor(),
        ),
        (CursorKind::Resizewesteast, NSCursor::columnResizeCursor()),
        (CursorKind::Resizenorthsouth, NSCursor::rowResizeCursor()),
        (
            CursorKind::Resizewesteast,
            NSCursor::frameResizeCursorFromPosition_inDirections(
                NSCursorFrameResizePosition::Left,
                all_directions,
            ),
        ),
        (
            CursorKind::Resizewesteast,
            NSCursor::frameResizeCursorFromPosition_inDirections(
                NSCursorFrameResizePosition::Right,
                all_directions,
            ),
        ),
        (
            CursorKind::Resizenorthsouth,
            NSCursor::frameResizeCursorFromPosition_inDirections(
                NSCursorFrameResizePosition::Top,
                all_directions,
            ),
        ),
        (
            CursorKind::Resizenorthsouth,
            NSCursor::frameResizeCursorFromPosition_inDirections(
                NSCursorFrameResizePosition::Bottom,
                all_directions,
            ),
        ),
        (
            CursorKind::Resizenortheastsouthwest,
            NSCursor::frameResizeCursorFromPosition_inDirections(
                NSCursorFrameResizePosition::TopRight,
                all_directions,
            ),
        ),
        (
            CursorKind::Resizenortheastsouthwest,
            NSCursor::frameResizeCursorFromPosition_inDirections(
                NSCursorFrameResizePosition::BottomLeft,
                all_directions,
            ),
        ),
        (
            CursorKind::Resizenorthwestsoutheast,
            NSCursor::frameResizeCursorFromPosition_inDirections(
                NSCursorFrameResizePosition::TopLeft,
                all_directions,
            ),
        ),
        (
            CursorKind::Resizenorthwestsoutheast,
            NSCursor::frameResizeCursorFromPosition_inDirections(
                NSCursorFrameResizePosition::BottomRight,
                all_directions,
            ),
        ),
    ]
}

fn hotspot(cursor: &NSCursor) -> Hotspot {
    let point = cursor.hotSpot();
    Hotspot {
        x: hotspot_coordinate(point.x),
        y: hotspot_coordinate(point.y),
    }
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn hotspot_coordinate(value: f64) -> u32 {
    value.clamp(0.0, f64::from(u32::MAX)) as u32
}

fn portable_name(kind: CursorKind) -> &'static str {
    match kind {
        CursorKind::Default => "arrow",
        CursorKind::Textcursor => "text",
        CursorKind::Handpointing => "hand",
        CursorKind::Busy => "busy",
        CursorKind::Help => "help",
        CursorKind::Cross => "cross",
        CursorKind::Move => "move",
        CursorKind::Notallowed => "not-allowed",
        CursorKind::Resizenorthsouth => "resize-ns",
        CursorKind::Resizewesteast => "resize-ew",
        CursorKind::Resizenortheastsouthwest => "resize-nesw",
        CursorKind::Resizenorthwestsoutheast => "resize-nwse",
        CursorKind::Custom => "custom",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_descriptor_is_traceable_and_portable() {
        let shape = system_descriptor(CursorKind::Handpointing, Hotspot { x: 4, y: 5 });
        assert_eq!(shape.cursor_id, "macos:hand");
        assert_eq!(shape.native_cursor_id, "macos:hand");
        assert_eq!(shape.cursor_kind, CursorKind::Handpointing);
        assert_eq!(shape.hotspot, Hotspot { x: 4, y: 5 });
    }

    #[test]
    fn custom_descriptor_never_claims_a_system_shape() {
        let shape = custom_descriptor(0x1234, Hotspot { x: 0, y: 1 });
        assert_eq!(shape.cursor_id, "macos:cursor:1234");
        assert_eq!(shape.cursor_kind, CursorKind::Custom);
        assert_eq!(shape.hotspot, Hotspot { x: 0, y: 1 });
    }

    #[test]
    fn hotspot_coordinate_clamps_invalid_appkit_values() {
        assert_eq!(hotspot_coordinate(-1.0), 0);
        assert_eq!(hotspot_coordinate(12.9), 12);
        assert_eq!(hotspot_coordinate(f64::INFINITY), u32::MAX);
    }
}
