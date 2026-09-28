//! Native script persistence shared with the existing Electron project format.

#[path = "teleprompter/types.rs"]
pub(crate) mod types;
use super::{
    files,
    json::{self, JsonFile, Writer},
    preferences::{Preferences, stored_types::PreferenceDocument},
};
use crate::ServiceRegistry;
use std::path::Path;
use types::TeleprompterDocument;

pub(super) const MAX_TEXT_BYTES: usize = 48 * 1024;

/// Reads the saved typed script or imports the existing reader settings.
pub(super) fn document(preferences: &PreferenceDocument) -> Result<TeleprompterDocument, String> {
    let extras = preferences.extras.as_ref();
    let script = if let Some(saved) =
        extras.and_then(|extras| extras.native_teleprompter_document.as_ref())
    {
        saved.clone()
    } else {
        let mut script = TeleprompterDocument::default();
        if let Some(settings) = extras.and_then(|extras| extras.teleprompter_settings.as_ref()) {
            script.settings = settings.clone();
        }
        script
    };
    validate(&script)?;
    Ok(script)
}

/// Checks script size and reader bounds before any file mutation.
pub(super) fn validate(script: &TeleprompterDocument) -> Result<(), String> {
    if script.schema_version != 1 {
        return Err("unsupported teleprompter document version".into());
    }
    if script.text.len() > MAX_TEXT_BYTES {
        return Err("script exceeds 48 KiB".into());
    }
    let settings = &script.settings;
    if !(16..=36).contains(&settings.font_size) {
        return Err("teleprompter font size must be 16–36".into());
    }
    for (key, number, min, max) in [
        ("speed", settings.scroll_speed, 5.0, 200.0),
        ("line height", settings.line_height, 1.0, 2.5),
    ] {
        if !number.is_finite() || !(min..=max).contains(&number) {
            return Err(format!("invalid teleprompter {key}"));
        }
    }
    time::OffsetDateTime::parse(
        &script.updated_at_utc,
        &time::format_description::well_known::Rfc3339,
    )
    .map_err(|error| format!("invalid teleprompter timestamp: {error}"))?;
    Ok(())
}

/// Exposes script editing through the preference Reader/Writer transaction.
pub(super) fn register(registry: &ServiceRegistry, preferences: Preferences) {
    let read = preferences.clone();
    registry.register("teleprompter", "read", move |_| {
        json::respond(read.read().and_then(|value| document(&value)))
    });
    registry.register("teleprompter", "write", move |value| {
        json::respond(json::decode(value).and_then(|script| preferences.save_script(script)))
    });
}

/// Copies the current script into the actual native capture session.
pub(super) fn checkpoint(preferences: &Preferences, manifest: &Path) -> Result<(), String> {
    let script = document(&preferences.read()?)?;
    if script.text.is_empty() {
        return Ok(());
    }
    let directory = manifest
        .parent()
        .ok_or("session manifest has no parent")?
        .join(files::SCRIPT_DIRECTORY);
    JsonFile::new(directory.join(files::TELEPROMPTER)).write(&script)
}

#[cfg(test)]
#[path = "../../test/beam/teleprompter.rs"]
mod tests;
