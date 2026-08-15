use super::*;

#[test]
fn returning_to_the_same_anchor_does_not_invent_an_excursion() {
    let mut fusion = CursorFusion::default();
    fusion.reconcile(anchor(0, 0, 0));
    fusion.push(CursorInputEvent {
        session_ns: 10,
        delta_x: 5,
        delta_y: 0,
    });
    fusion.reconcile(anchor(20, 10, 0));
    fusion.push(CursorInputEvent {
        session_ns: 25,
        delta_x: 5,
        delta_y: 0,
    });
    fusion.push(CursorInputEvent {
        session_ns: 30,
        delta_x: -5,
        delta_y: 0,
    });

    let events = fusion.reconcile(anchor(40, 10, 0));
    assert!(matches!(events[0], FusedCursorEvent { pixel_x: 10, .. }));
    assert!(matches!(events[1], FusedCursorEvent { pixel_x: 10, .. }));
}

#[test]
fn out_of_order_input_is_sorted_before_partitioning() {
    let mut fusion = CursorFusion::default();
    fusion.reconcile(anchor(0, 0, 0));
    fusion.push(CursorInputEvent {
        session_ns: 20,
        delta_x: 2,
        delta_y: 0,
    });
    fusion.push(CursorInputEvent {
        session_ns: 10,
        delta_x: 1,
        delta_y: 0,
    });

    let events = fusion.reconcile(anchor(30, 30, 0));
    assert!(matches!(
        events.as_slice(),
        [
            FusedCursorEvent {
                session_ns: 10,
                pixel_x: 10,
                ..
            },
            FusedCursorEvent {
                session_ns: 20,
                pixel_x: 20,
                ..
            }
        ]
    ));
}

#[test]
fn noisy_raw_motion_never_escapes_the_pipewire_segment() {
    let mut fusion = CursorFusion::default();
    fusion.reconcile(anchor(0, 10, 20));
    for (session_ns, delta_x, delta_y) in [(10, 500, -900), (20, -1_000, 1_800), (30, 501, -899)] {
        fusion.push(CursorInputEvent {
            session_ns,
            delta_x,
            delta_y,
        });
    }

    let events = fusion.reconcile(anchor(40, 30, 60));
    assert_eq!(
        events.last().map(|event| (event.pixel_x, event.pixel_y)),
        Some((25, 50))
    );
    assert!(events.iter().all(|event| {
        (10..=30).contains(&event.pixel_x)
            && (20..=60).contains(&event.pixel_y)
            && (0.1..=0.3).contains(&event.normalized_x)
            && (0.2..=0.6).contains(&event.normalized_y)
    }));
}

#[test]
fn noisy_raw_motion_cannot_reverse_progress_along_the_segment() {
    let mut fusion = CursorFusion::default();
    fusion.reconcile(anchor(0, 0, 0));
    for (session_ns, delta_x) in [(10, 8), (20, -6), (30, 8)] {
        fusion.push(CursorInputEvent {
            session_ns,
            delta_x,
            delta_y: 0,
        });
    }

    let events = fusion.reconcile(anchor(40, 100, 0));
    assert!(
        events
            .windows(2)
            .all(|pair| pair[0].pixel_x <= pair[1].pixel_x)
    );
    assert_eq!(events.last().map(|event| event.pixel_x), Some(75));
}

#[test]
fn duplicate_and_regressing_anchors_do_not_move_the_timeline_backwards() {
    let mut fusion = CursorFusion::default();
    fusion.reconcile(anchor(100, 0, 0));
    fusion.push(CursorInputEvent {
        session_ns: 105,
        delta_x: 1,
        delta_y: 0,
    });
    assert!(fusion.reconcile(anchor(100, 20, 0)).is_empty());
    assert!(fusion.reconcile(anchor(80, 30, 0)).is_empty());
    fusion.push(CursorInputEvent {
        session_ns: 115,
        delta_x: 1,
        delta_y: 0,
    });

    let events = fusion.reconcile(anchor(120, 40, 0));
    assert_eq!(
        events
            .iter()
            .map(|event| event.session_ns)
            .collect::<Vec<_>>(),
        vec![105, 115]
    );
    assert!(
        events
            .windows(2)
            .all(|pair| pair[0].session_ns <= pair[1].session_ns)
    );
}

#[test]
fn interval_boundaries_discard_the_start_include_the_target_and_keep_the_future() {
    let mut fusion = CursorFusion::default();
    fusion.reconcile(anchor(10, 0, 0));
    for session_ns in [10, 20, 30] {
        fusion.push(CursorInputEvent {
            session_ns,
            delta_x: 1,
            delta_y: 0,
        });
    }

    let first = fusion.reconcile(anchor(20, 20, 0));
    assert_eq!(
        first
            .iter()
            .map(|event| event.session_ns)
            .collect::<Vec<_>>(),
        vec![20]
    );
    let second = fusion.reconcile(anchor(40, 40, 0));
    assert_eq!(
        second
            .iter()
            .map(|event| event.session_ns)
            .collect::<Vec<_>>(),
        vec![30]
    );
}
