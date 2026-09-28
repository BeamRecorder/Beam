#![cfg(test)]

use super::NativeI18n;
use serde_json::{Value, json};

fn response(encoded: String) -> Value {
    serde_json::from_str(&encoded).unwrap()
}

fn catalogs() -> Value {
    json!({
        "fallback": "en",
        "catalogs": {
            "en": {
                "HUD-stopRecording": "Stop ({ $time })",
                "HUD-startRecording": "Start Recording",
                "HUD-plural": "{ $count ->\n    [one] one\n   *[other] other\n}",
                "HUD-number": "Count: { $count }",
                "HUD-flag": "{ $enabled ->\n    [true] on\n   *[false] off\n}",
                "HUD-empty": "English fallback",
            },
            "fr": {
                "HUD-stopRecording": "Arrêter ({ $time })",
                "HUD-plural": "{ $count ->\n    [one] un\n   *[other] autres\n}",
                "HUD-empty": "",
            },
            "ru": {
                "HUD-plural": "{ $count ->\n    [one] one\n    [few] few\n    [many] many\n   *[other] other\n}",
            },
        },
    })
}

fn loaded() -> NativeI18n {
    let mut native = NativeI18n::default();
    assert_eq!(
        response(native.load(&catalogs().to_string())),
        json!({ "locale": "en", "rtl": false }),
    );
    native
}

fn text(native: &NativeI18n, id: &str, args: Value) -> String {
    let value = response(native.translate(id, &args.to_string()));
    value["value"]
        .as_str()
        .expect("successful translation")
        .into()
}

#[test]
fn flat_hud_ids_and_string_variables_format_through_the_native_engine() {
    let native = loaded();
    assert_eq!(
        text(&native, "HUD-stopRecording", json!({ "time": "00:42" })),
        "Stop (\u{2068}00:42\u{2069})",
    );
    assert_eq!(
        text(&native, "HUD-startRecording", json!({})),
        "Start Recording"
    );
}

#[test]
fn locale_changes_update_text_and_missing_messages_use_the_english_fallback() {
    let mut native = loaded();
    assert_eq!(
        response(native.select("fr")),
        json!({ "locale": "fr", "rtl": false })
    );
    assert_eq!(
        text(&native, "HUD-stopRecording", json!({ "time": "01:02" })),
        "Arrêter (\u{2068}01:02\u{2069})",
    );
    assert_eq!(
        text(&native, "HUD-startRecording", json!({})),
        "Start Recording"
    );
    assert_eq!(
        response(native.select("en")),
        json!({ "locale": "en", "rtl": false })
    );
    assert_eq!(
        text(&native, "HUD-stopRecording", json!({ "time": "01:02" })),
        "Stop (\u{2068}01:02\u{2069})",
    );
}

#[test]
fn initial_and_subsequent_locales_are_negotiated_against_available_catalogs() {
    let mut native = NativeI18n::default();
    let mut config = catalogs();
    config["locale"] = json!("fr-CA");
    assert_eq!(
        response(native.load(&config.to_string())),
        json!({ "locale": "fr", "rtl": false })
    );
    assert_eq!(
        response(native.select("ja-JP")),
        json!({ "locale": "en", "rtl": false })
    );
    assert_eq!(
        response(native.select("fr-CA")),
        json!({ "locale": "fr", "rtl": false })
    );
}

#[test]
fn numbers_remain_numeric_for_interpolation_and_locale_specific_plural_rules() {
    let mut native = loaded();
    assert_eq!(
        text(&native, "HUD-number", json!({ "count": 2 })),
        "Count: \u{2068}2\u{2069}"
    );
    for (count, expected) in [(0, "other"), (1, "one"), (2, "other")] {
        assert_eq!(
            text(&native, "HUD-plural", json!({ "count": count })),
            expected
        );
    }
    assert_eq!(
        text(&native, "HUD-plural", json!({ "count": "1" })),
        "other"
    );
    native.select("fr");
    for (count, expected) in [(0, "un"), (1, "un"), (2, "autres")] {
        assert_eq!(
            text(&native, "HUD-plural", json!({ "count": count })),
            expected
        );
    }
    native.select("ru");
    for (count, expected) in [
        (0, "many"),
        (1, "one"),
        (2, "few"),
        (5, "many"),
        (21, "one"),
    ] {
        assert_eq!(
            text(&native, "HUD-plural", json!({ "count": count })),
            expected
        );
    }
    assert_eq!(
        text(&native, "HUD-plural", json!({ "count": 1.5 })),
        "other"
    );
}

#[test]
fn boolean_variables_are_passed_as_fluent_selector_strings() {
    let native = loaded();
    assert_eq!(text(&native, "HUD-flag", json!({ "enabled": true })), "on");
    assert_eq!(
        text(&native, "HUD-flag", json!({ "enabled": false })),
        "off"
    );
}

#[test]
fn empty_localized_text_does_not_accidentally_use_the_fallback_message() {
    let mut native = loaded();
    native.select("fr");
    assert_eq!(text(&native, "HUD-empty", json!({})), "");
}

#[test]
fn invalid_catalogs_and_fallbacks_leave_the_previously_loaded_locale_intact() {
    let mut native = loaded();
    native.select("fr");
    for config in [
        json!({ "fallback": "en", "catalogs": { "en": { "HUD.stopRecording": "Stop" } } }),
        json!({ "fallback": "en", "catalogs": { "en": { "HUD": { "stopRecording": "Stop" } } } }),
        json!({ "fallback": "en", "catalogs": { "en": { "HUD-stopRecording": "Stop { $time" } } }),
        json!({ "fallback": "fr", "catalogs": { "en": { "HUD-stopRecording": "Stop" } } }),
        json!({ "fallback": "!", "catalogs": { "en": {} } }),
        json!({ "fallback": 42, "catalogs": { "en": {} } }),
        json!({ "fallback": "en", "catalogs": {} }),
        json!({ "fallback": "en", "catalogs": [] }),
        json!({ "fallback": "en", "catalogs": { "!": {} } }),
        json!({ "fallback": "en", "locale": "!", "catalogs": { "en": {} } }),
    ] {
        let result = response(native.load(&config.to_string()));
        assert!(result["error"].is_string(), "accepted {config}: {result}");
        assert!(result.get("value").is_none());
        assert_eq!(
            text(&native, "HUD-stopRecording", json!({ "time": "00:01" })),
            "Arrêter (\u{2068}00:01\u{2069})",
        );
    }
    assert!(response(native.load("{bad"))["error"].is_string());
}

#[test]
fn invalid_locale_selection_keeps_the_previous_translation() {
    let mut native = loaded();
    native.select("fr");
    let result = response(native.select("!"));
    assert!(
        result["error"]
            .as_str()
            .unwrap()
            .contains("invalid selected locale")
    );
    assert_eq!(
        text(&native, "HUD-stopRecording", json!({ "time": "00:01" })),
        "Arrêter (\u{2068}00:01\u{2069})",
    );
}

#[test]
fn unloaded_catalogs_report_errors_for_selection_and_translation() {
    let mut native = NativeI18n::default();
    for result in [
        response(native.select("en")),
        response(native.translate("HUD-startRecording", "{}")),
    ] {
        assert!(
            result["error"]
                .as_str()
                .unwrap()
                .contains("catalogs are not loaded")
        );
        assert!(result.get("value").is_none());
    }
}

#[test]
fn malformed_variables_and_missing_messages_never_return_broken_text() {
    let native = loaded();
    for args in [
        "{bad",
        "[]",
        "null",
        "42",
        "{\"time\":null}",
        "{\"time\":[]}",
        "{\"time\":{}}",
        "{}",
    ] {
        let result = response(native.translate("HUD-stopRecording", args));
        assert!(result["error"].is_string(), "accepted {args}: {result}");
        assert!(result.get("value").is_none());
    }
    let missing = response(native.translate("HUD-missing", "{}"));
    assert!(missing["error"].is_string());
    assert!(missing.get("value").is_none());
}

#[test]
fn generated_beam_catalogs_load_and_translate_all_fifteen_locales() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/beam-ui/src/solid/shared/i18n/catalogs.generated.json");
    let source = std::fs::read_to_string(&path)
        .expect("generate the Beam i18n catalogs before running native validations");
    let config: Value = serde_json::from_str(&source).unwrap();
    let messages = config["catalogs"].as_object().unwrap();
    let locales = [
        "en", "fr", "es", "de", "ru", "bg", "zh-CN", "ko", "pt-BR", "ja", "it", "pl", "zh-TW",
        "hi", "vi",
    ];
    assert_eq!(config["fallback"], "en");
    assert_eq!(messages.len(), locales.len());

    let mut native = NativeI18n::default();
    let loaded = response(native.load(&source));
    assert_eq!(loaded, json!({ "locale": "en", "rtl": false }), "{loaded}");
    for locale in locales {
        let selected = response(native.select(locale));
        assert_eq!(selected, json!({ "locale": locale, "rtl": false }));
        let localized = messages.get(locale).expect("every supported locale exists");
        for id in ["HUD-window", "Native-fullScreen", "Teleprompter-title"] {
            let expected = localized[id]
                .as_str()
                .expect("label exists in its own locale");
            let result = response(native.translate(id, "{}"));
            assert!(result.get("error").is_none(), "{locale}/{id}: {result}");
            let label = result["value"].as_str().unwrap();
            assert!(!label.trim().is_empty(), "{locale}/{id}");
            assert_ne!(label, id, "{locale}/{id} returned its message ID");
            assert_eq!(label, expected, "{locale}/{id}");
        }

        let id = "Updates-updateAvailable";
        let pattern = localized[id]
            .as_str()
            .expect("update label exists in its own locale");
        assert!(pattern.contains("{ $version }"), "{locale}/{id}: {pattern}");
        let version = "42.0.7";
        let args = json!({ "version": version }).to_string();
        let result = response(native.translate(id, &args));
        assert!(result.get("error").is_none(), "{locale}/{id}: {result}");
        let label = result["value"].as_str().unwrap();
        let expected = pattern.replace("{ $version }", &format!("\u{2068}{version}\u{2069}"));
        assert_eq!(label, expected, "{locale}/{id}");
        assert!(label.contains(version), "{locale}/{id}: {label}");
        assert!(!label.contains("{ $version }"), "{locale}/{id}: {label}");
        assert_ne!(label, id, "{locale}/{id} returned its message ID");
    }
}
