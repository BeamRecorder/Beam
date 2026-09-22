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
        CursorEvent::Metadata { session_ns, .. }
        | CursorEvent::Move { session_ns, .. }
        | CursorEvent::Shape { session_ns, .. }
        | CursorEvent::Button { session_ns, .. }
        | CursorEvent::Visibility { session_ns, .. }
        | CursorEvent::CropChanged { session_ns, .. } => *session_ns,
    }
}

#[path = "../../../test/screen/linux/cursor_buttons.rs"]
mod cursor_buttons_checks;
