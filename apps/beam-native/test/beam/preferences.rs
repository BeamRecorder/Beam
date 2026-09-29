#[allow(dead_code)]
#[path = "../../src/beam/preferences.rs"]
mod preferences;

#[allow(dead_code)]
#[path = "../../src/beam/files.rs"]
mod files;
#[allow(dead_code, unused_imports)]
#[path = "../../src/beam/json.rs"]
mod json;
#[allow(dead_code)]
#[path = "../../src/beam/teleprompter.rs"]
mod teleprompter;
use beam_native::{ServiceOutcome, ServiceRegistry};
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(1);

fn fixture() -> (PathBuf, preferences::Preferences) {
    let root = std::env::temp_dir().join(format!(
        "beam-native-preferences-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    let path = root.join("preferences.json");
    (root, preferences::Preferences::at(path))
}

#[test]
fn missing_file_has_safe_defaults() {
    let (root, preferences) = fixture();
    let view = preferences.view().unwrap();
    assert_eq!(view["theme"], "system");
    assert!(
        [
            "en", "fr", "es", "de", "ru", "bg", "zh-CN", "ko", "pt-BR", "ja", "it", "pl", "zh-TW",
            "hi", "vi"
        ]
        .contains(&view["locale"].as_str().unwrap())
    );
    assert!(!root.exists());
    assert_eq!(view["captureMode"], "recorder");
    assert_eq!(view["hudWindow"], json!({ "width": 680, "height": 252 }));
    assert_eq!(view["windowPositions"], json!({}));
    assert_eq!(view["shortcuts"]["hud.startStopRecording"], "Alt+Shift+R");
    assert_eq!(preferences.initialize().unwrap(), view);
    assert!(!root.exists());
}

#[test]
fn supported_patch_preserves_editor_only_keys() {
    let (root, preferences) = fixture();
    fs::create_dir_all(&root).unwrap();
    fs::write(
        root.join("preferences.json"),
        json!({ "editor": { "zoom": 2 }, "extras": { "known": true } }).to_string(),
    )
    .unwrap();
    let result = preferences
        .patch(&json!({ "theme": "dark", "captureMode": "instant",
        "hudWindow": { "width": 600, "height": 240 }, "hudPosition": { "x": -100, "y": 20 },
        "devices": { "microphone": "mic-1", "systemAudio": "speaker-1" },
        "shortcuts": { "hud.playPause": "Ctrl+Shift+P" }, "countdownSeconds": 5 }))
        .unwrap();
    assert_eq!(result["captureMode"], "instant");
    assert_eq!(result["hudPosition"], json!({ "x": -100, "y": 20 }));
    let stored = json::encode(&preferences.read().unwrap()).unwrap();
    assert_eq!(stored["editor"]["zoom"], 2);
    assert_eq!(stored["extras"]["known"], true);
    assert_eq!(stored["devices"]["micId"], "mic-1");
    assert_eq!(stored["shortcuts"]["hud.playPause"]["keys"], "Ctrl+Shift+P");
    assert_eq!(stored["extras"]["nativeHudLayoutVersion"], 4);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn invalid_patch_never_replaces_existing_preferences() {
    let (root, preferences) = fixture();
    fs::create_dir_all(&root).unwrap();
    let original = json!({ "theme": "light", "editor": { "markers": 3 } }).to_string();
    fs::write(root.join("preferences.json"), &original).unwrap();
    assert!(
        preferences
            .patch(&json!({ "hudWindow": { "width": 100, "height": 420 } }))
            .is_err()
    );
    assert!(preferences.patch(&json!({ "unknown": true })).is_err());
    assert_eq!(
        fs::read_to_string(root.join("preferences.json")).unwrap(),
        original
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn malformed_existing_json_is_reported_without_repairing_it() {
    let (root, preferences) = fixture();
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("preferences.json"), "{bad").unwrap();
    assert!(preferences.initialize().is_err());
    assert!(preferences.patch(&json!({ "theme": "dark" })).is_err());
    assert_eq!(
        fs::read_to_string(root.join("preferences.json")).unwrap(),
        "{bad"
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn legacy_hud_sizes_reset_once_and_preserve_other_preferences() {
    for version in [
        None,
        Some(json!(1)),
        Some(json!(2)),
        Some(json!(3)),
        Some(json!("2")),
    ] {
        let (root, preferences) = fixture();
        fs::create_dir_all(&root).unwrap();
        let mut original = json!({
            "hudWindow": { "width": 980, "height": 510 },
            "theme": "dark", "devices": { "micId": "mic-1" },
            "shortcuts": { "hud.startStopRecording": { "keys": "Ctrl+Shift+R" } },
            "editor": { "zoom": 2 },
            "extras": { "known": true, "nativeHudPosition": { "x": -100, "y": 20 } },
        });
        if let Some(version) = version {
            original["extras"]["nativeHudLayoutVersion"] = version;
        }
        fs::write(root.join("preferences.json"), original.to_string()).unwrap();
        let compact = json!({ "width": 680, "height": 252 });
        assert_eq!(preferences.view().unwrap()["hudWindow"], compact);
        let view = preferences.initialize().unwrap();
        assert_eq!(view["hudWindow"], compact);
        let mut expected = original;
        expected["hudWindow"] = compact;
        expected["extras"]["nativeHudLayoutVersion"] = json!(4);
        assert_eq!(
            json::encode(&preferences.read().unwrap()).unwrap(),
            expected
        );
        let saved = fs::read(root.join("preferences.json")).unwrap();
        assert_eq!(preferences.initialize().unwrap(), view);
        assert_eq!(fs::read(root.join("preferences.json")).unwrap(), saved);
        fs::remove_dir_all(root).unwrap();
    }
}

#[test]
fn current_version_out_of_bounds_hud_sizes_recover_without_losing_preferences() {
    for size in [
        json!({ "width": 352, "height": 512 }),
        json!({ "width": 439, "height": 208 }),
        json!({ "width": 680, "height": 253 }),
    ] {
        let (root, preferences) = fixture();
        fs::create_dir_all(&root).unwrap();
        let original = json!({
            "hudWindow": size,
            "theme": "dark",
            "editor": { "zoom": 2 },
            "extras": { "nativeHudLayoutVersion": 4, "known": true },
        });
        fs::write(root.join(files::PREFERENCES), original.to_string()).unwrap();
        let recovered = json!({ "width": 680, "height": 252 });
        assert_eq!(preferences.view().unwrap()["hudWindow"], recovered);
        assert_eq!(preferences.initialize().unwrap()["hudWindow"], recovered);
        let stored = json::encode(&preferences.read().unwrap()).unwrap();
        assert_eq!(stored["hudWindow"], recovered);
        assert_eq!(stored["theme"], "dark");
        assert_eq!(stored["editor"]["zoom"], 2);
        assert_eq!(stored["extras"]["known"], true);
        fs::remove_dir_all(root).unwrap();
    }
}

#[test]
fn explicit_resizes_survive_initialization_and_still_validate_bounds() {
    let (root, preferences) = fixture();
    fs::create_dir_all(&root).unwrap();
    fs::write(
        root.join("preferences.json"),
        json!({"hudWindow": {"width": 580, "height": 230}}).to_string(),
    )
    .unwrap();
    assert_eq!(
        preferences.view().unwrap()["hudWindow"],
        json!({"width": 680, "height": 252})
    );
    let view = preferences
        .patch(&json!({"hudWindow": {"width": 580, "height": 230}}))
        .unwrap();
    assert_eq!(view["hudWindow"], json!({"width": 580, "height": 230}));
    assert_eq!(preferences.view().unwrap()["hudWindow"], view["hudWindow"]);
    assert_eq!(
        preferences.initialize().unwrap()["hudWindow"],
        view["hudWindow"]
    );
    assert!(
        preferences
            .patch(&json!({"hudWindow": {"width": 440, "height": 208}}))
            .is_ok()
    );
    assert!(
        preferences
            .patch(&json!({"hudWindow": {"width": 440, "height": 207}}))
            .is_err()
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn typed_preference_patches_reject_unknown_fields_and_wrong_types() {
    let (root, preferences) = fixture();
    preferences.patch(&json!({"theme": "dark"})).unwrap();
    let before = fs::read(root.join(files::PREFERENCES)).unwrap();
    for patch in [
        json!({"devices":{"unknown":"x"}}),
        json!({"countdownSeconds":0}),
        json!({"hudWindow":{"width":681,"height":252}}),
        json!({"theme":"invalid"}),
        json!({"shortcuts":{"hud.playPause":9}}),
    ] {
        assert!(preferences.patch(&patch).is_err());
        assert_eq!(fs::read(root.join(files::PREFERENCES)).unwrap(), before);
    }
    fs::write(root.join(files::PREFERENCES), "null").unwrap();
    assert!(preferences.patch(&json!({"theme":"light"})).is_err());
    assert_eq!(
        fs::read_to_string(root.join(files::PREFERENCES)).unwrap(),
        "null"
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn locale_patch_uses_shared_editor_storage_and_preserves_other_extras() {
    let (root, preferences) = fixture();
    fs::create_dir_all(&root).unwrap();
    let mut expected = json!({
        "theme": "light",
        "editor": { "zoom": 2 },
        "extras": {
            "locale": "en",
            "known": true,
            "editorSettings": { "spellCheck": false, "recent": ["project-1"] },
        },
    });
    fs::write(root.join(files::PREFERENCES), expected.to_string()).unwrap();

    let view = preferences
        .patch(&json!({ "locale": "fr", "theme": "dark" }))
        .unwrap();
    assert_eq!(view["locale"], "fr");
    assert_eq!(view["theme"], "dark");
    assert_eq!(preferences.view().unwrap()["locale"], "fr");
    expected["theme"] = json!("dark");
    expected["extras"]["locale"] = json!("fr");
    let stored = json::encode(&preferences.read().unwrap()).unwrap();
    assert_eq!(stored, expected);
    assert!(stored.get("locale").is_none());
    let subsequent = preferences.patch(&json!({ "theme": "light" })).unwrap();
    assert_eq!(subsequent["locale"], "fr");
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn every_supported_locale_round_trips_through_shared_preferences() {
    let (root, preferences) = fixture();
    for locale in [
        "en", "fr", "es", "de", "ru", "bg", "zh-CN", "ko", "pt-BR", "ja", "it", "pl", "zh-TW",
        "hi", "vi",
    ] {
        let view = preferences.patch(&json!({ "locale": locale })).unwrap();
        assert_eq!(view["locale"], locale);
        assert_eq!(preferences.view().unwrap()["locale"], locale);
        let stored = json::encode(&preferences.read().unwrap()).unwrap();
        assert_eq!(stored["extras"]["locale"], locale);
    }
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn invalid_locale_patch_is_rejected_before_any_other_field_is_written() {
    let (root, preferences) = fixture();
    fs::create_dir_all(&root).unwrap();
    let original = json!({
        "theme": "light", "editor": { "zoom": 2 },
        "extras": { "locale": "fr", "known": true },
    })
    .to_string();
    fs::write(root.join(files::PREFERENCES), &original).unwrap();
    for locale in [
        json!(""),
        json!("xx"),
        json!("fr-CA"),
        json!("pt"),
        json!("FR"),
        json!(" fr"),
        json!("fr "),
        json!(42),
        json!(true),
        json!([]),
        json!({}),
    ] {
        let patch = json!({ "locale": locale, "theme": "dark" });
        assert!(preferences.patch(&patch).is_err(), "accepted {patch}");
        assert_eq!(
            fs::read_to_string(root.join(files::PREFERENCES)).unwrap(),
            original,
            "modified storage for {patch}",
        );
        assert_eq!(preferences.view().unwrap()["locale"], "fr");
    }
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn invalid_stored_locale_falls_back_without_rewriting_editor_preferences() {
    let (root, preferences) = fixture();
    let automatic = preferences.view().unwrap()["locale"].clone();
    fs::create_dir_all(&root).unwrap();
    for locale in [
        json!(""),
        json!("xx"),
        json!("fr-CA"),
        json!(null),
        json!(42),
        json!(false),
        json!([]),
        json!({ "value": "fr" }),
    ] {
        let original = json!({
            "theme": "dark",
            "extras": { "locale": locale, "editorSettings": { "known": true } },
        })
        .to_string();
        fs::write(root.join(files::PREFERENCES), &original).unwrap();
        assert_eq!(
            preferences.view().unwrap()["locale"],
            automatic,
            "{original}"
        );
        assert_eq!(preferences.initialize().unwrap()["locale"], automatic);
        assert_eq!(
            fs::read_to_string(root.join(files::PREFERENCES)).unwrap(),
            original,
        );
        let repaired = preferences.patch(&json!({ "locale": "fr" })).unwrap();
        assert_eq!(repaired["locale"], "fr");
        let stored = json::encode(&preferences.read().unwrap()).unwrap();
        assert_eq!(stored["extras"]["locale"], "fr");
        assert_eq!(stored["extras"]["editorSettings"]["known"], true);
    }
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn auxiliary_positions_merge_and_survive_reopening_preferences() {
    let (root, preferences) = fixture();
    preferences
        .patch(&json!({ "windowPositions": {
        "recorder": { "x": -1200, "y": 800 }, "countdown": { "x": 400, "y": 300 }
    } }))
        .unwrap();
    let updated = preferences
        .patch(&json!({ "windowPositions": {
        "recorder": { "x": -1000, "y": 700 }
    } }))
        .unwrap();
    assert_eq!(
        updated["windowPositions"]["countdown"],
        json!({ "x": 400, "y": 300 })
    );
    let reopened = preferences::Preferences::at(root.join("preferences.json"))
        .view()
        .unwrap();
    assert_eq!(reopened["windowPositions"], updated["windowPositions"]);
    assert_eq!(
        reopened["windowPositions"]["recorder"],
        json!({ "x": -1000, "y": 700 })
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn invalid_auxiliary_positions_never_replace_saved_positions() {
    let (root, preferences) = fixture();
    preferences
        .patch(&json!({ "windowPositions": { "recorder": { "x": 400, "y": 300 } } }))
        .unwrap();
    let original = fs::read_to_string(root.join("preferences.json")).unwrap();
    for positions in [
        json!({ "regionControls": { "x": 0, "y": 0 } }),
        json!({ "recorder": { "x": 100001, "y": 0 } }),
        json!({ "countdown": { "x": 0, "y": -100001 } }),
        json!({ "settings": { "x": 0.5, "y": 0 } }),
        json!({ "teleprompter": { "x": 0, "y": 0, "width": 100 } }),
    ] {
        assert!(
            preferences
                .patch(&json!({ "windowPositions": positions }))
                .is_err()
        );
        assert_eq!(
            fs::read_to_string(root.join("preferences.json")).unwrap(),
            original
        );
    }
    fs::remove_dir_all(root).unwrap();
}
