use super::*;
use serde_json::Value;
use std::{
    fs,
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);

#[test]
fn defaults_and_saved_settings_use_the_same_typed_schema() {
    let mut preferences = serde_json::json!({});
    let script = document(&json::decode(preferences.clone()).unwrap()).unwrap();
    assert_eq!(script.settings.font_size, 36);
    assert_eq!(script.settings.scroll_speed, 42.0);
    assert_eq!(script.settings.use_theme_text_color, Some(true));
    validate(&script).unwrap();
    preferences["extras"] = serde_json::json!({ "teleprompterSettings": {
        "mode": "line-by-line", "autoscroll": false, "scrollSpeed": 60,
        "fontSize": 28, "lineHeight": 1.5, "textAlign": "center" } });
    assert_eq!(
        document(&json::decode(preferences.clone()).unwrap())
            .unwrap()
            .settings
            .font_size,
        28
    );
    preferences["extras"]["teleprompterSettings"]["mode"] = Value::from("invalid");
    assert!(json::decode::<PreferenceDocument>(preferences).is_err());
}

#[test]
fn old_scripts_keep_their_custom_color_and_an_unspecified_theme_color_choice() {
    let mut value = serde_json::to_value(TeleprompterDocument::default()).unwrap();
    value.as_object_mut().unwrap().remove("useThemeTextColor");
    value["textColor"] = Value::from("#ff804080");
    let saved: TeleprompterDocument = json::decode(value).unwrap();
    assert_eq!(saved.settings.text_color, "#ff804080");
    assert_eq!(saved.settings.use_theme_text_color, None);
    validate(&saved).unwrap();
}

#[test]
fn explicit_theme_and_custom_color_choices_round_trip_and_invalid_values_fail() {
    for choice in [Some(true), Some(false), None] {
        let mut script = TeleprompterDocument::default();
        script.settings.use_theme_text_color = choice;
        let decoded: TeleprompterDocument =
            json::decode(serde_json::to_value(script).unwrap()).unwrap();
        assert_eq!(decoded.settings.use_theme_text_color, choice);
    }
    for choice in [
        serde_json::json!("true"),
        serde_json::json!(1),
        serde_json::json!({}),
    ] {
        let mut value = serde_json::to_value(TeleprompterDocument::default()).unwrap();
        value["useThemeTextColor"] = choice;
        assert!(json::decode::<TeleprompterDocument>(value).is_err());
    }
}

#[test]
fn script_validation_covers_versions_size_numeric_bounds_and_timestamps() {
    let script = TeleprompterDocument::default();
    for invalid in [0, 2] {
        let mut value = script.clone();
        value.schema_version = invalid;
        assert!(validate(&value).is_err());
    }
    let mut value = script.clone();
    value.text = "é".repeat(MAX_TEXT_BYTES / 2);
    validate(&value).unwrap();
    value.text.push('a');
    assert!(validate(&value).is_err());
    for speed in [f64::NAN, 4.9, 200.1] {
        let mut value = script.clone();
        value.settings.scroll_speed = speed;
        assert!(validate(&value).is_err());
    }
    for size in [15, 97] {
        let mut value = script.clone();
        value.settings.font_size = size;
        assert!(validate(&value).is_err());
    }
    let mut value = script;
    value.updated_at_utc = "not a date".into();
    assert!(validate(&value).is_err());
}

#[test]
fn checkpoint_persists_the_script_in_the_actual_session_directory() {
    let root = std::env::temp_dir().join(format!(
        "beam-script-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    let preferences = Preferences::at(root.join(files::PREFERENCES));
    let manifest = root.join("capture/manifest.json");
    checkpoint(&preferences, &manifest).unwrap();
    assert!(!root.exists());
    let script = TeleprompterDocument {
        text: "Bonjour 🚀".into(),
        ..Default::default()
    };
    preferences.save_script(script.clone()).unwrap();
    checkpoint(&preferences, &manifest).unwrap();
    use super::super::json::Reader;
    let saved = JsonFile::new(
        root.join("capture")
            .join(files::SCRIPT_DIRECTORY)
            .join(files::TELEPROMPTER),
    )
    .read::<TeleprompterDocument>()
    .unwrap()
    .unwrap();
    assert_eq!(saved.text, script.text);
    assert!(
        preferences
            .read()
            .unwrap()
            .extras
            .unwrap()
            .teleprompter_settings
            .is_some()
    );
    fs::remove_dir_all(root).unwrap();
}
