use super::cursor_preferences::saved;
use beam_editor_engine::project::cursor_preferences::import;
#[test]
fn optional_original_auto_hide_uses_its_documented_defaults() {
    let mut value = saved();
    value.as_object_mut().unwrap().remove("autoHide");
    let style = import(&value).unwrap();
    assert_eq!(style.hide_after_ms, 0);
    assert_eq!(style.fade_duration_ms, 250);
}
#[test]
fn missing_required_settings_and_invalid_enums_fail_explicitly() {
    let mut value = saved();
    value["motion"]["preset"] = "unknown".into();
    assert!(import(&value).is_err());
    for key in ["selection", "shadow", "motion", "clickEffects"] {
        let mut value = saved();
        value.as_object_mut().unwrap().remove(key);
        assert!(import(&value).is_err());
    }
}
#[test]
fn out_of_range_original_preferences_do_not_become_a_fake_valid_profile() {
    for delay in [0.1, 11.] {
        let mut value = saved();
        value["autoHide"]["delaySeconds"] = delay.into();
        assert!(import(&value).is_err());
    }
    let mut value = saved();
    value["size"] = 0.into();
    assert!(import(&value).is_err());
}
