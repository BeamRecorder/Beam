use beam_editor_engine::project::cursor_preferences::{self, color, import};
use serde_json::json;
pub(super) fn saved() -> serde_json::Value {
    json!({"selection":{"packId":"builtin:macos","mode":"automatic","cursorId":null},"size":52,"color":"#12abef80","shadow":{"enabled":true,"blur":8,"color":"#0008","direction":"top-left"},"motion":{"preset":"custom","smoothing":0.4,"springMassMultiplier":1.1,"motionBlur":0.8},"clickEffects":{"left":{"springEnabled":true,"springIntensity":60,"rippleEnabled":true,"rippleStyle":"double","rippleSize":44,"rippleColor":"#abcdef"},"right":{"springEnabled":false,"springIntensity":0,"rippleEnabled":true,"rippleStyle":"solid","rippleSize":24,"rippleColor":"#123"}},"autoHide":{"enabled":true,"delaySeconds":3.5,"fadeDurationMs":400}})
}
#[test]
fn every_original_cursor_setting_is_imported_and_validated() {
    let style = import(&saved()).unwrap();
    assert_eq!(style.size, 52.);
    assert_eq!(style.color, color("#12abef80").unwrap());
    assert_eq!(style.shadow.blur, 8.);
    assert_eq!(style.motion.motion_blur, 0.8);
    assert_eq!(style.hide_after_ms, 3500);
    assert_eq!(style.fade_duration_ms, 400);
    assert_eq!(style.click_effects.left.ripple_size, 44.);
    assert!(!style.click_effects.right.spring_enabled);
    assert!(style.validate().is_ok());
}
#[test]
fn hexadecimal_colors_support_alpha_and_reject_invalid_inputs() {
    assert_eq!(
        color("#123").unwrap(),
        [17. / 255., 34. / 255., 51. / 255., 1.]
    );
    assert_eq!(color("#0000").unwrap(), [0.; 4]);
    assert_eq!(color("#abcdef").unwrap()[3], 1.);
    for value in ["red", "#", "#12", "#12345", "#ggg", "#123456789"] {
        assert!(color(value).is_err());
    }
}
#[test]
fn global_defaults_distinguish_absence_from_corruption_and_recorded_overrides() {
    let root = tempfile::tempdir().unwrap();
    assert!(cursor_preferences::defaults(root.path()).unwrap().is_none());
    std::fs::write(
        root.path().join("preferences.json"),
        serde_json::to_vec(
            &json!({"extras":{"editorDefaults":{"presentation":{"cursor":saved()}}}}),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        cursor_preferences::defaults(root.path()).unwrap(),
        Some(import(&saved()).unwrap())
    );
    assert!(!cursor_preferences::has_recorded_profile(root.path()).unwrap());
    std::fs::write(
        root.path().join("project.json"),
        serde_json::to_vec(&json!({"editor":{"presentation":{"cursor":saved()}}})).unwrap(),
    )
    .unwrap();
    assert!(cursor_preferences::has_recorded_profile(root.path()).unwrap());
    std::fs::write(root.path().join("preferences.json"), b"{").unwrap();
    assert!(cursor_preferences::defaults(root.path()).is_err());
}
