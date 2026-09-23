#![cfg(test)]

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
