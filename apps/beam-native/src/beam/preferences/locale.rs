//! Native locale preference: explicit editor choice, then the OS language list.

const SUPPORTED: &[&str] = &[
    "en", "fr", "es", "de", "ru", "bg", "zh-CN", "ko", "pt-BR", "ja", "it", "pl", "zh-TW", "hi",
    "vi",
];

pub(super) fn validate(value: &str) -> Result<(), String> {
    if SUPPORTED.contains(&value) {
        Ok(())
    } else {
        Err(format!("unsupported locale: {value}"))
    }
}

/// OS discovery remains platform-native; an automatic result is never persisted.
pub(super) fn stored(value: Option<&str>) -> String {
    resolve(value, sys_locale::get_locales())
}

fn resolve(saved: Option<&str>, system: impl IntoIterator<Item = impl AsRef<str>>) -> String {
    if let Some(locale) = saved.filter(|locale| SUPPORTED.contains(locale)) {
        return locale.to_owned();
    }
    system
        .into_iter()
        .find_map(|locale| supported_system_locale(locale.as_ref()))
        .unwrap_or("en")
        .to_owned()
}

/// Maps regional OS tags onto the translations Beam actually ships.
fn supported_system_locale(locale: &str) -> Option<&'static str> {
    let tag = locale
        .split(['.', '@'])
        .next()?
        .replace('_', "-")
        .to_ascii_lowercase();
    let parts = tag.split('-').collect::<Vec<_>>();
    match *parts.first()? {
        "zh" => Some(
            if parts
                .iter()
                .any(|part| matches!(*part, "hant" | "tw" | "hk" | "mo"))
            {
                "zh-TW"
            } else {
                "zh-CN"
            },
        ),
        "pt" => Some("pt-BR"),
        language => SUPPORTED
            .iter()
            .copied()
            .find(|candidate| *candidate == language),
    }
}

#[path = "../../../test/beam/preferences/locale.rs"]
mod locale_checks;
