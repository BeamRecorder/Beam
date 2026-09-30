use beam_editor_domain::recording::{
    cursor_style_types::{MotionPreset, SelectionMode, ShadowDirection},
    style_types::CursorStyle,
};
#[test]
fn defaults_match_the_original_beam_cursor_profile() {
    let style = CursorStyle::default();
    assert_eq!(style.size, 45.);
    assert_eq!(style.selection.pack_id, "builtin:macos");
    assert_eq!(style.selection.mode, SelectionMode::Automatic);
    assert_eq!(style.motion.preset, MotionPreset::Smooth);
    assert_eq!(style.motion.smoothing, 0.67);
    assert_eq!(style.motion.spring_mass_multiplier, 1.29);
    assert_eq!(style.shadow.direction, ShadowDirection::Bottom);
    assert_eq!(style.shadow.blur, 6.);
    assert_eq!(style.fade_duration_ms, 250);
    assert!(!style.click_effects.left.ripple_enabled);
    assert_ne!(
        style.click_effects.left.ripple_color,
        style.click_effects.right.ripple_color
    );
}
#[test]
fn older_native_styles_receive_the_restored_presentation_defaults() {
    let style:CursorStyle=serde_json::from_value(serde_json::json!({"enabled":true,"shape":"pointer","size":24.,"color":[1.,1.,1.,1.],"borderColor":[0.,0.,0.,1.],"smoothingMs":60,"hideAfterMs":3000,"clicks":true})).unwrap();
    assert_eq!(style.selection, CursorStyle::default().selection);
    assert_eq!(style.size, 24.);
    assert_eq!(style.hide_after_ms, 3000);
}
#[test]
fn every_restored_field_roundtrips_without_changing_saved_colors() {
    let style = CursorStyle::default();
    let restored: CursorStyle =
        serde_json::from_slice(&serde_json::to_vec(&style).unwrap()).unwrap();
    assert_eq!(style, restored);
}
