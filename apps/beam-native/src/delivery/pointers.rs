//! Latest absolute pointer state for editor drags; gesture deltas are never coalesced.
use argui_core::PointerPhase;
use argui_runtime::NativeHostDelivery;
use argui_ui::UiEventKind;

/// Collapses consecutive moves for the same pointer and handler, preserving every boundary.
/// Only callers whose controls derive state from absolute position may use this.
pub fn coalesce_absolute_pointer_moves(
    deliveries: Vec<NativeHostDelivery>,
) -> Vec<NativeHostDelivery> {
    let mut result: Vec<NativeHostDelivery> = Vec::with_capacity(deliveries.len());
    for delivery in deliveries {
        let replace = result
            .last()
            .is_some_and(|last| match (&last.kind, &delivery.kind) {
                (UiEventKind::Pointer(a), UiEventKind::Pointer(b)) => {
                    a.phase == PointerPhase::Moved
                        && b.phase == PointerPhase::Moved
                        && a.id == b.id
                        && last.callback.node == delivery.callback.node
                        && last.callback.callback == delivery.callback.callback
                        && last.pointer.is_some()
                        && delivery.pointer.is_some()
                }
                _ => false,
            });
        if replace {
            *result.last_mut().expect("previous pointer") = delivery;
        } else {
            result.push(delivery);
        }
    }
    result
}
