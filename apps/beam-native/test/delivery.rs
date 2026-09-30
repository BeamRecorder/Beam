use argui_core::{Point, PointerEvent, PointerPhase};
use argui_runtime::{
    CallbackDelivery, CallbackId, HostId, NativeHostDelivery, NativePointerPosition,
};
use argui_ui::UiEventKind;
use beam_native::event_json;

#[path = "delivery/resizes.rs"]
mod resizes;

#[test]
fn native_window_and_reload_generations_deliver_to_the_local_js_identity() {
    for generation in [1, 2, 100_000, 200_000, 300_000, 400_000] {
        let delivery = NativeHostDelivery {
            callback: CallbackDelivery {
                node: HostId::new(42, generation),
                callback: CallbackId(7),
            },
            kind: UiEventKind::Pointer(PointerEvent::mouse(
                PointerPhase::Moved,
                Point::new(600.0, 400.0),
            )),
            pointer: Some(NativePointerPosition {
                x: 600.0,
                y: 400.0,
                local_x: 200.0,
                local_y: 150.0,
                width: 900.0,
                height: 700.0,
            }),
        };
        let encoded = event_json(&delivery);
        assert_eq!(encoded["node"]["slot"], 42);
        assert_eq!(encoded["node"]["generation"], 1);
        assert_eq!(encoded["callback"], 7);
        assert_eq!(encoded["payload"]["kind"], "pointerMove");
        assert_eq!(encoded["payload"]["x"], 600.0);
        assert_eq!(encoded["payload"]["localX"], 200.0);
        assert_eq!(delivery.callback.node.generation(), generation);
    }
}

#[path = "delivery/pointers.rs"]
mod pointers;

#[path = "delivery/types.rs"]
mod types;

#[test]
fn wheel_delivery_preserves_axes_units_and_trackpad_fractional_values() {
    for (delta, x, y, unit) in [
        (
            argui_core::ScrollDelta::Lines(Point::new(2., 0.)),
            2.,
            0.,
            "lines",
        ),
        (
            argui_core::ScrollDelta::Lines(Point::new(0., -3.)),
            0.,
            -3.,
            "lines",
        ),
        (
            argui_core::ScrollDelta::Pixels(Point::new(1.25, -0.5)),
            1.25,
            -0.5,
            "pixels",
        ),
    ] {
        let delivery = NativeHostDelivery {
            callback: CallbackDelivery {
                node: HostId::new(1, 1),
                callback: CallbackId(7),
            },
            kind: UiEventKind::Wheel {
                delta,
                position: Point::new(10., 20.),
            },
            pointer: None,
        };
        let payload = event_json(&delivery)["payload"].clone();
        assert_eq!(payload["kind"], "wheel");
        assert_eq!(payload["deltaX"], x);
        assert_eq!(payload["deltaY"], y);
        assert_eq!(payload["deltaMode"], unit);
    }
}
