use crate::cursor::CursorEvent;

#[derive(Debug, Clone, Copy)]
pub(super) struct RecordedButton {
    pub(super) session_ns: u64,
    pub(super) button: u8,
    pub(super) pressed: bool,
}

pub(super) fn materialize_buttons(events: &mut Vec<CursorEvent>, mut buttons: Vec<RecordedButton>) {
    buttons.sort_by_key(|button| button.session_ns);
    let mut moves = events
        .iter()
        .filter_map(|event| match event {
            CursorEvent::Move {
                session_ns,
                normalized_x,
                normalized_y,
                ..
            } => Some((*session_ns, *normalized_x, *normalized_y)),
            _ => None,
        })
        .collect::<Vec<_>>();
    moves.sort_by_key(|movement| movement.0);
    let mut move_index = 0;
    for button in buttons {
        while move_index < moves.len() && moves[move_index].0 <= button.session_ns {
            move_index += 1;
        }
        let previous = move_index.checked_sub(1).and_then(|index| moves.get(index));
        let next = moves.get(move_index);
        let Some((normalized_x, normalized_y)) = position_at(previous, next) else {
            continue;
        };
        events.push(CursorEvent::Button {
            session_ns: button.session_ns,
            button: button.button,
            pressed: button.pressed,
            normalized_x,
            normalized_y,
        });
    }
    events.sort_by_key(event_session_ns);
}

fn position_at(
    previous: Option<&(u64, f64, f64)>,
    next: Option<&(u64, f64, f64)>,
) -> Option<(f64, f64)> {
    match (previous, next) {
        (Some(previous), _) => Some((previous.1, previous.2)),
        (_, Some(next)) => Some((next.1, next.2)),
        (None, None) => None,
    }
}

fn event_session_ns(event: &CursorEvent) -> u64 {
    match event {
        CursorEvent::Move { session_ns, .. }
        | CursorEvent::Shape { session_ns, .. }
        | CursorEvent::Button { session_ns, .. }
        | CursorEvent::Visibility { session_ns, .. }
        | CursorEvent::CropChanged { session_ns, .. } => *session_ns,
    }
}

#[cfg(test)]
mod tests {
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
}
