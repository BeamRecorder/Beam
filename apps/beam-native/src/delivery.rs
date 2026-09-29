//! Converts native UI deliveries into the JavaScript bridge event payload.

use std::collections::HashMap;

use argui_core::{Key, KeyState};
use argui_runtime::{HostId, NativeHostDelivery};
use argui_ui::{GestureKind, GesturePhase, SemanticAction, SemanticValue, UiEventKind};
use serde_json::Value;
mod pointers;
mod resizes;
mod types;
pub use pointers::coalesce_absolute_pointer_moves;
pub use resizes::coalesce_window_resizes;
use types::{
    CallbackEvent, EventData, EventPayload, Measurement, NodeIdentity, PointerGeometry,
    SemanticValue as SerializedSemanticValue,
};

/// Keeps the newest virtual-window callback for each native node in a burst.
///
/// `deliveries` is the native FIFO burst. Returns deliveries in order, with
/// obsolete window ranges removed until a different event forms an ordering
/// boundary. Clicks and measurements are never discarded.
pub fn coalesce_virtual_windows(deliveries: Vec<NativeHostDelivery>) -> Vec<NativeHostDelivery> {
    let mut result = Vec::with_capacity(deliveries.len());
    let mut pending: HashMap<(HostId, u32), usize> = HashMap::new();
    for delivery in deliveries {
        if matches!(delivery.kind, UiEventKind::VirtualWindowChanged { .. }) {
            let key = (delivery.callback.node, delivery.callback.callback.0);
            if let Some(index) = pending.get(&key) {
                result[*index] = delivery;
            } else {
                pending.insert(key, result.len());
                result.push(delivery);
            }
        } else {
            pending.clear();
            result.push(delivery);
        }
    }
    result
}

/// Encodes one native callback and its UI event for the JavaScript subscriber.
///
/// `delivery` contains the native node, callback, and event after its owning
/// session has been checked. Native generations isolate windows and reloads;
/// the JavaScript host retains generation 1 inside each independent session.
pub fn event_json(delivery: &NativeHostDelivery) -> Value {
    let mut payload = ui_event_payload(&delivery.kind);
    if let Some(pointer) = delivery.pointer
        && let Value::Object(fields) = &mut payload
    {
        let geometry = crate::json::encode(&PointerGeometry {
            x: pointer.x,
            y: pointer.y,
            local_x: pointer.local_x,
            local_y: pointer.local_y,
            width: pointer.width,
            height: pointer.height,
        })
        .expect("pointer geometry is serializable");
        fields.extend(geometry.as_object().expect("geometry is an object").clone());
    }
    crate::json::encode(&CallbackEvent {
        node: NodeIdentity {
            slot: delivery.callback.node.slot(),
            generation: 1,
        },
        callback: delivery.callback.callback.0,
        payload,
    })
    .expect("native callback events are serializable")
}

/// Encodes the public fields of `kind` for a JavaScript event handler.
///
/// Returns a JSON payload with a stable `kind` string. Text edits carry UTF-8
/// byte range endpoints and replacement text. Scroll and pan distances use
/// logical pixels, while pan velocity uses logical pixels per second.
pub fn ui_event_payload(kind: &UiEventKind) -> Value {
    let (name, data) = match kind {
        UiEventKind::ResizeCommitted { value } => {
            ("resizeCommit", EventData::Resize { value: *value })
        }
        UiEventKind::KeyInput(input) => (
            "key",
            EventData::Key {
                key: key_name(&input.key),
                state: match input.state {
                    KeyState::Pressed => "pressed",
                    KeyState::Released => "released",
                },
                text: input.text.clone(),
                shift: input.modifiers.shift,
                control: input.modifiers.control,
                alt: input.modifiers.alt,
                super_key: input.modifiers.super_key,
                repeat: input.repeat,
            },
        ),
        UiEventKind::TextChanged(text) => ("input", EventData::Text { text: text.clone() }),
        UiEventKind::TextEdited(edit) => (
            "edit",
            EventData::Edit {
                start: edit.range.start,
                end: edit.range.end,
                text: edit.replacement.clone(),
            },
        ),
        UiEventKind::Submitted(text) => ("submit", EventData::Text { text: text.clone() }),
        UiEventKind::Focused => ("focus", EventData::Empty {}),
        UiEventKind::Blurred => ("blur", EventData::Empty {}),
        UiEventKind::Click(_) => ("click", EventData::Empty {}),
        UiEventKind::Scrolled { offset, .. } => (
            "scroll",
            EventData::Scroll {
                offset_x: offset.x,
                offset_y: offset.y,
            },
        ),
        UiEventKind::Gesture(gesture) => match gesture.kind {
            GestureKind::Pan {
                delta,
                total,
                velocity,
                ..
            } => (
                "pan",
                EventData::Pan {
                    delta_x: delta.x,
                    delta_y: delta.y,
                    total_x: total.x,
                    total_y: total.y,
                    velocity_x: velocity.x,
                    velocity_y: velocity.y,
                    phase: match gesture.phase {
                        GesturePhase::Started => "started",
                        GesturePhase::Changed => "changed",
                        GesturePhase::Ended => "ended",
                        GesturePhase::Cancelled => "cancelled",
                    },
                },
            ),
            _ => ("gesture", EventData::Empty {}),
        },
        UiEventKind::VirtualMeasured {
            items,
            corrected_offset,
            viewport_extent,
        } => (
            "measure",
            EventData::Measure {
                items: items
                    .iter()
                    .map(|item| Measurement {
                        index: item.index,
                        extent: item.extent,
                    })
                    .collect(),
                corrected_offset: *corrected_offset,
                viewport_extent: *viewport_extent,
            },
        ),
        UiEventKind::VirtualWindowChanged {
            start,
            end,
            offset,
            viewport_extent,
        } => (
            "window",
            EventData::Window {
                start: *start,
                end: *end,
                offset: *offset,
                viewport_extent: *viewport_extent,
            },
        ),
        UiEventKind::SemanticAction { action, value } => (
            "semanticAction",
            EventData::Semantic {
                action: match action {
                    SemanticAction::Click => "click",
                    SemanticAction::Focus => "focus",
                    SemanticAction::Blur => "blur",
                    SemanticAction::Increment => "increment",
                    SemanticAction::Decrement => "decrement",
                    SemanticAction::Expand => "expand",
                    SemanticAction::Collapse => "collapse",
                    SemanticAction::SetValue => "setValue",
                    SemanticAction::ScrollIntoView => "scrollIntoView",
                },
                value: match value {
                    Some(SemanticValue::Text(text)) => {
                        Some(SerializedSemanticValue::Text(text.clone()))
                    }
                    Some(SemanticValue::Number { value, .. }) => {
                        Some(SerializedSemanticValue::Number(*value))
                    }
                    None => None,
                },
            },
        ),
        other => (other.event_type().wire_name(), EventData::Empty {}),
    };
    crate::json::encode(&EventPayload { kind: name, data })
        .expect("native event payloads are serializable")
}

/// Gives a native key a stable spelling for JavaScript callbacks.
///
/// `key` is the platform-independent key. Returns its character value or
/// the Rust key variant name.
fn key_name(key: &Key) -> String {
    match key {
        Key::Character(value) => value.clone(),
        other => format!("{other:?}"),
    }
}
