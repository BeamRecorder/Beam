#![cfg(test)]

use super::*;

fn movement(session_ns: u64, x: f64) -> CursorEvent {
    CursorEvent::Move {
        session_ns,
        cursor_id: None,
        pixel_x: 0,
        pixel_y: 0,
        normalized_x: x,
        normalized_y: 0.25,
        visible: true,
    }
}

#[test]
fn materializes_every_button_at_its_original_timestamp() {
    let mut events = vec![movement(0, 0.0), movement(100, 1.0)];
    materialize_buttons(
        &mut events,
        vec![
            RecordedButton {
                session_ns: 25,
                button: 1,
                pressed: true,
            },
            RecordedButton {
                session_ns: 75,
                button: 1,
                pressed: false,
            },
        ],
    );
    let buttons = events
        .iter()
        .filter(|event| matches!(event, CursorEvent::Button { .. }))
        .collect::<Vec<_>>();
    assert_eq!(buttons.len(), 2);
    assert!(
        matches!(buttons[0], CursorEvent::Button { session_ns: 25, normalized_x, .. } if *normalized_x == 0.0)
    );
    assert!(
        matches!(buttons[1], CursorEvent::Button { session_ns: 75, normalized_x, .. } if *normalized_x == 0.0)
    );
}

#[test]
fn buttons_outside_the_move_range_use_the_nearest_position() {
    let mut events = vec![movement(50, 0.4)];
    materialize_buttons(
        &mut events,
        vec![
            RecordedButton {
                session_ns: 10,
                button: 1,
                pressed: true,
            },
            RecordedButton {
                session_ns: 90,
                button: 1,
                pressed: false,
            },
        ],
    );
    assert!(events.iter().filter(|event| matches!(event, CursorEvent::Button { normalized_x, .. } if *normalized_x == 0.4)).count() == 2);
}

#[test]
fn no_position_means_no_fabricated_button_event() {
    let mut events = Vec::new();
    materialize_buttons(
        &mut events,
        vec![RecordedButton {
            session_ns: 10,
            button: 1,
            pressed: true,
        }],
    );
    assert!(events.is_empty());
}

#[test]
fn unsorted_moves_still_place_buttons_on_the_previous_timeline_position() {
    let mut events = vec![movement(100, 1.0), movement(0, 0.0), movement(50, 0.5)];
    materialize_buttons(
        &mut events,
        vec![RecordedButton {
            session_ns: 75,
            button: 1,
            pressed: true,
        }],
    );

    assert!(events.iter().any(|event| {
        matches!(
            event,
            CursorEvent::Button {
                session_ns: 75,
                normalized_x,
                ..
            } if *normalized_x == 0.5
        )
    }));
}
