#![cfg(test)]

use super::*;

#[path = "extra_tests.rs"]
mod extra;

fn anchor(session_ns: u64, pixel_x: i32, pixel_y: i32) -> CursorAnchor {
    CursorAnchor {
        session_ns,
        pixel_x,
        pixel_y,
        normalized_x: f64::from(pixel_x) / 100.0,
        normalized_y: f64::from(pixel_y) / 100.0,
    }
}

#[test]
fn input_timestamps_are_interpolated_between_pipewire_anchors() {
    let mut fusion = CursorFusion::default();
    assert!(fusion.reconcile(anchor(0, 10, 20)).is_empty());
    fusion.push(CursorInputEvent {
        session_ns: 10,
        delta_x: 2,
        delta_y: 0,
    });
    fusion.push(CursorInputEvent {
        session_ns: 20,
        delta_x: 3,
        delta_y: 0,
    });

    let events = fusion.reconcile(anchor(30, 20, 20));
    assert!(matches!(events[0], FusedCursorEvent { pixel_x: 13, .. }));
    assert!(matches!(events[1], FusedCursorEvent { pixel_x: 17, .. }));
}

#[test]
fn progress_is_independent_from_pipewire_coordinate_rotation() {
    let mut fusion = CursorFusion::default();
    fusion.reconcile(anchor(0, 10, 10));
    fusion.push(CursorInputEvent {
        session_ns: 10,
        delta_x: 5,
        delta_y: 0,
    });

    let events = fusion.reconcile(anchor(20, 10, 20));
    assert!(matches!(
        events[0],
        FusedCursorEvent {
            pixel_x: 10,
            pixel_y: 15,
            ..
        }
    ));
}

#[test]
fn motion_before_the_first_anchor_is_discarded() {
    let mut fusion = CursorFusion::default();
    fusion.push(CursorInputEvent {
        session_ns: 5,
        delta_x: 50,
        delta_y: 50,
    });
    assert!(fusion.reconcile(anchor(10, 20, 20)).is_empty());
    assert!(fusion.reconcile(anchor(20, 20, 20)).is_empty());
}

#[test]
fn pending_motion_after_an_anchor_is_kept_for_the_next_interval() {
    let mut fusion = CursorFusion::default();
    fusion.reconcile(anchor(0, 0, 0));
    fusion.push(CursorInputEvent {
        session_ns: 20,
        delta_x: 4,
        delta_y: 0,
    });
    assert!(fusion.reconcile(anchor(10, 5, 0)).is_empty());
    let events = fusion.reconcile(anchor(30, 15, 0));
    assert!(matches!(events[0], FusedCursorEvent { pixel_x: 10, .. }));
}

#[test]
fn finish_does_not_extrapolate_without_a_pipewire_anchor() {
    let mut fusion = CursorFusion::default();
    fusion.reconcile(anchor(0, 0, 0));
    fusion.push(CursorInputEvent {
        session_ns: 10,
        delta_x: 5,
        delta_y: 0,
    });
    fusion.reconcile(anchor(20, 10, 0));
    fusion.push(CursorInputEvent {
        session_ns: 30,
        delta_x: 5,
        delta_y: 0,
    });
    assert!(fusion.finish().is_empty());
}
