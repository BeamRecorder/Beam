use super::*;
use beam_native::coalesce_absolute_pointer_moves;
fn delivery(phase: PointerPhase, x: f32, callback: u32) -> NativeHostDelivery {
    NativeHostDelivery {
        callback: CallbackDelivery {
            node: HostId::new(7, 1),
            callback: CallbackId(callback),
        },
        kind: UiEventKind::Pointer(PointerEvent::mouse(phase, Point::new(x, 0.))),
        pointer: Some(NativePointerPosition {
            x,
            y: 0.,
            local_x: x,
            local_y: 0.,
            width: 100.,
            height: 100.,
        }),
    }
}
#[test]
fn consecutive_absolute_moves_keep_final_position_and_reduce_obsolete_commits() {
    let burst = (0..1000)
        .map(|i| delivery(PointerPhase::Moved, i as f32, 1))
        .collect();
    let result = coalesce_absolute_pointer_moves(burst);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].pointer.unwrap().x, 999.);
    assert!(coalesce_absolute_pointer_moves(vec![]).is_empty());
}
#[test]
fn release_cancel_and_handler_changes_preserve_order() {
    let result = coalesce_absolute_pointer_moves(vec![
        delivery(PointerPhase::Pressed, 0., 1),
        delivery(PointerPhase::Moved, 10., 1),
        delivery(PointerPhase::Moved, 20., 1),
        delivery(PointerPhase::Moved, 21., 2),
        delivery(PointerPhase::Released, 22., 1),
        delivery(PointerPhase::Cancelled, 23., 1),
    ]);
    assert_eq!(
        result
            .iter()
            .map(|event| event.pointer.unwrap().x)
            .collect::<Vec<_>>(),
        vec![0., 20., 21., 22., 23.]
    );
}
#[test]
fn missing_absolute_geometry_and_native_generations_are_not_coalesced() {
    let mut other = delivery(PointerPhase::Moved, 1., 1);
    other.callback.node = HostId::new(7, 2);
    assert_eq!(
        coalesce_absolute_pointer_moves(vec![delivery(PointerPhase::Moved, 0., 1), other]).len(),
        2
    );
    let mut missing = delivery(PointerPhase::Moved, 1., 1);
    missing.pointer = None;
    assert_eq!(
        coalesce_absolute_pointer_moves(vec![delivery(PointerPhase::Moved, 0., 1), missing]).len(),
        2
    );
}
