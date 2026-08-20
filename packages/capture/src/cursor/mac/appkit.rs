use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

use objc2::{MainThreadMarker, rc::autoreleasepool};
use objc2_app_kit::{NSCursor, NSCursorFrameResizeDirections, NSCursorFrameResizePosition};

use crate::{
    CaptureError,
    cursor::{CursorKind, Hotspot, resilient_source::ResilientSource},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct MacCursorShape {
    pub(crate) cursor_id: String,
    pub(crate) cursor_kind: CursorKind,
    pub(crate) native_cursor_id: String,
    pub(crate) hotspot: Hotspot,
}

#[derive(Debug, Clone)]
pub(crate) struct MacCursorShapeSource {
    latest: ResilientSource<MacCursorShape>,
    failures: Arc<AtomicU64>,
}

impl Default for MacCursorShapeSource {
    fn default() -> Self {
        Self {
            latest: ResilientSource::new(system_descriptor(
                CursorKind::Default,
                Hotspot { x: 10, y: 7 },
            )),
            failures: Arc::new(AtomicU64::new(0)),
        }
    }
}

impl MacCursorShapeSource {
    pub(crate) fn current(&self) -> MacCursorShape {
        self.latest.current()
    }

    /// Samples AppKit only when called by the capture engine's main thread.
    /// Errors and Objective-C exceptions leave the last valid shape untouched.
    pub(crate) fn refresh_on_main_thread(&self) -> bool {
        let refreshed = self.latest.refresh(current_system_shape);
        if !refreshed {
            self.failures.fetch_add(1, Ordering::Relaxed);
        }
        refreshed
    }

    pub(crate) fn failures(&self) -> u64 {
        self.failures.load(Ordering::Relaxed)
    }
}

#[allow(deprecated)]
fn current_system_shape() -> Result<MacCursorShape, CaptureError> {
    MainThreadMarker::new().ok_or_else(|| {
        CaptureError::Backend("macOS cursor shape sampling requires the main thread".into())
    })?;
    autoreleasepool(|_| {
        NSCursor::currentSystemCursor()
            .as_deref()
            .map(descriptor_for)
            .ok_or_else(|| CaptureError::Backend("AppKit returned no current cursor".into()))
    })
}

fn descriptor_for(cursor: &NSCursor) -> MacCursorShape {
    let hotspot = hotspot(cursor);
    classify(cursor).map_or_else(
        || custom_descriptor(cursor as *const NSCursor as usize, hotspot),
        |kind| system_descriptor(kind, hotspot),
    )
}

fn system_descriptor(cursor_kind: CursorKind, hotspot: Hotspot) -> MacCursorShape {
    let native_cursor_id = format!("macos:{}", portable_name(cursor_kind));
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
    let directions = NSCursorFrameResizeDirections::All;
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
        frame_cursor(
            CursorKind::Resizewesteast,
            NSCursorFrameResizePosition::Left,
            directions,
        ),
        frame_cursor(
            CursorKind::Resizewesteast,
            NSCursorFrameResizePosition::Right,
            directions,
        ),
        frame_cursor(
            CursorKind::Resizenorthsouth,
            NSCursorFrameResizePosition::Top,
            directions,
        ),
        frame_cursor(
            CursorKind::Resizenorthsouth,
            NSCursorFrameResizePosition::Bottom,
            directions,
        ),
        frame_cursor(
            CursorKind::Resizenortheastsouthwest,
            NSCursorFrameResizePosition::TopRight,
            directions,
        ),
        frame_cursor(
            CursorKind::Resizenortheastsouthwest,
            NSCursorFrameResizePosition::BottomLeft,
            directions,
        ),
        frame_cursor(
            CursorKind::Resizenorthwestsoutheast,
            NSCursorFrameResizePosition::TopLeft,
            directions,
        ),
        frame_cursor(
            CursorKind::Resizenorthwestsoutheast,
            NSCursorFrameResizePosition::BottomRight,
            directions,
        ),
    ]
}

fn frame_cursor(
    kind: CursorKind,
    position: NSCursorFrameResizePosition,
    directions: NSCursorFrameResizeDirections,
) -> (CursorKind, objc2::rc::Retained<NSCursor>) {
    (
        kind,
        NSCursor::frameResizeCursorFromPosition_inDirections(position, directions),
    )
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
    fn shape_source_starts_with_a_renderable_arrow() {
        let shape = MacCursorShapeSource::default().current();
        assert_eq!(shape.cursor_id, "macos:arrow");
        assert_eq!(shape.cursor_kind, CursorKind::Default);
        assert_eq!(shape.hotspot, Hotspot { x: 10, y: 7 });
    }

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
