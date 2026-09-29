//! Verifies typed resize payloads through the public callback serializer.

use argui_runtime::{CallbackDelivery, CallbackId, HostId, NativeHostDelivery};
use argui_ui::UiEventKind;
use beam_native::event_json;

#[test]
fn native_resize_commit_delivers_its_final_size_without_pointer_geometry() {
    let delivery = NativeHostDelivery {
        callback: CallbackDelivery {
            node: HostId::new(42, 1),
            callback: CallbackId(7),
        },
        kind: UiEventKind::ResizeCommitted { value: 321.5 },
        pointer: None,
    };
    let encoded = event_json(&delivery);
    assert_eq!(
        encoded["payload"],
        serde_json::json!({"kind":"resizeCommit", "value":321.5})
    );
}
