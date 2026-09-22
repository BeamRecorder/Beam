#![allow(clippy::expect_used)]

use beam_media_manifest::{PermissionSnapshot, PermissionState};

#[test]
fn permission_states_keep_the_v2_wire_names() {
    let snapshot = PermissionSnapshot {
        screen: Some(PermissionState::PromptRequired),
        accessibility: Some(PermissionState::NotApplicable),
    };
    let json = serde_json::to_value(&snapshot).expect("serialize");
    assert_eq!(json["screen"], "prompt-required");
    assert_eq!(json["accessibility"], "not-applicable");
    assert_eq!(
        serde_json::from_value::<PermissionSnapshot>(json).expect("deserialize"),
        snapshot
    );
}

#[test]
fn empty_permission_snapshot_preserves_unknown_state_as_absent() {
    let snapshot: PermissionSnapshot = serde_json::from_str("{}").expect("empty snapshot");
    assert_eq!(snapshot, PermissionSnapshot::default());
    assert_eq!(snapshot.screen, None);
}
