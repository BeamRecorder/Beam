use super::types::{RegionMessage, RegionState};

#[test]
fn a_new_region_has_no_screen_pixels_magnifier_source_or_active_selection() {
    let state = RegionState::default();
    assert!(!state.open && !state.created);
    assert!(state.crop.is_none() && state.source_id.is_none() && state.pixels.is_none());
    assert!(state.magnifier.is_none());
    assert_eq!(state.preset, "free");
}

#[test]
fn region_messages_reject_extra_fields_unknown_actions_and_invalid_revisions() {
    for payload in [
        r#"{"action":"present","revision":-1}"#,
        r#"{"action":"present","revision":1,"x":0}"#,
        r#"{"action":"unknown"}"#,
    ] {
        assert!(serde_json::from_str::<RegionMessage>(payload).is_err());
    }
}

#[test]
fn region_messages_preserve_revisions_and_unicode_pixel_presets() {
    let value =
        serde_json::from_str::<RegionMessage>(r#"{"action":"present","revision":100}"#).unwrap();
    assert!(matches!(value, RegionMessage::Present { revision: 100 }));
    let value = serde_json::from_str::<RegionMessage>(r#"{"action":"preset","value":"1920×1080"}"#)
        .unwrap();
    assert!(matches!(value, RegionMessage::Preset { value } if value == "1920×1080"));
}
