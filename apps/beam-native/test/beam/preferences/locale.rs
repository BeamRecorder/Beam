#![cfg(test)]
use super::{resolve, supported_system_locale};

#[test]
fn explicit_choice_wins_over_system_language_and_invalid_storage_uses_os() {
    assert_eq!(resolve(Some("fr"), ["en-US", "de-DE"]), "fr");
    assert_eq!(resolve(Some("en"), ["fr-FR"]), "en");
    assert_eq!(resolve(Some("xx"), ["de-DE"]), "de");
    assert_eq!(resolve(None, ["unknown", "fr-FR"]), "fr");
    assert_eq!(resolve(None, ["C", "POSIX"]), "en");
    assert_eq!(resolve(None, std::iter::empty::<&str>()), "en");
}

#[test]
fn regional_locale_tags_match_beams_supported_languages() {
    for (input, expected) in [
        ("fr-CA", "fr"),
        ("EN_us.UTF-8", "en"),
        ("de_DE@euro", "de"),
        ("pt-PT", "pt-BR"),
        ("pt_BR", "pt-BR"),
        ("zh-Hans", "zh-CN"),
        ("zh-SG", "zh-CN"),
        ("zh-Hant", "zh-TW"),
        ("zh_HK.UTF-8", "zh-TW"),
        ("zh-TW", "zh-TW"),
        ("zh-MO", "zh-TW"),
        ("ru-RU", "ru"),
        ("hi-IN", "hi"),
    ] {
        assert_eq!(supported_system_locale(input), Some(expected), "{input}");
    }
    for input in ["", "C", "POSIX", "ar-EG", "unknown"] {
        assert_eq!(supported_system_locale(input), None, "{input}");
    }
}
