//! Typed native preferences over Beam's shared editor document.

#[path = "preferences/locale.rs"]
mod locale;
#[path = "preferences/stored_types.rs"]
pub(crate) mod stored_types;
#[path = "preferences/types.rs"]
mod types;
use super::{
    files,
    json::{self, JsonFile, Reader},
    teleprompter,
};
use serde_json::Value;
use std::path::PathBuf;
use stored_types::{AudioMode, PreferenceDocument, StoredCaptureMode};
pub(crate) use types::{CaptureMode, DEFAULT_SHORTCUTS, NativePreferences, Theme, WindowSize};
use types::{Devices, PreferencePatch};

const HUD_LAYOUT_VERSION: u64 = 4;
pub(crate) const HUD_MIN_SIZE: (u64, u64) = (440, 208);
pub(crate) const HUD_MAX_SIZE: (u64, u64) = (680, 252);
const DEFAULT_COUNTDOWN_SECONDS: u8 = 3;

#[derive(Clone)]
pub(super) struct Preferences {
    file: JsonFile,
}
impl Preferences {
    /// Locates the preference document shared with the Electron editor.
    pub(super) fn new() -> Result<Self, String> {
        let user = std::env::var_os("BEAM_USER_DIR")
            .map(PathBuf::from)
            .or_else(|| dirs::video_dir().map(|path| path.join("Beam/user")))
            .ok_or("Videos directory is unavailable; set BEAM_USER_DIR")?;
        Ok(Self::at(user.join(files::PREFERENCES)))
    }
    pub(super) fn at(path: PathBuf) -> Self {
        Self {
            file: JsonFile::new(path),
        }
    }
    pub(super) fn projects_root(&self) -> Result<PathBuf, String> {
        Ok(self
            .file
            .path()
            .parent()
            .ok_or("preferences path has no parent")?
            .join(files::PROJECTS_DIRECTORY))
    }
    pub(super) fn read(&self) -> Result<PreferenceDocument, String> {
        Ok(self.file.read()?.unwrap_or_default())
    }
    pub(super) fn view(&self) -> Result<Value, String> {
        json::encode(&view_of(&self.read()?)?)
    }
    pub(super) fn initialize(&self) -> Result<Value, String> {
        if legacy_hud_layout(&self.read()?) {
            self.patch_typed(PreferencePatch::default())
        } else {
            self.view()
        }
    }
    /// Validates a typed patch and atomically commits it through the shared store.
    pub(super) fn patch(&self, patch: &Value) -> Result<Value, String> {
        self.patch_typed(json::decode(patch.clone())?)
    }
    fn patch_typed(&self, patch: PreferencePatch) -> Result<Value, String> {
        validate_patch(&patch)?;
        self.file.update::<PreferenceDocument, _>(|document| {
            apply_patch(document, patch);
            if legacy_hud_layout(document) {
                save_size(document, WindowSize::default());
            }
            json::encode(&view_of(document)?)
        })
    }
    pub(super) fn save_script(
        &self,
        script: teleprompter::types::TeleprompterDocument,
    ) -> Result<(), String> {
        self.patch_typed(PreferencePatch {
            teleprompter_document: Some(script),
            ..PreferencePatch::default()
        })
        .map(|_| ())
    }
}
fn validate_patch(patch: &PreferencePatch) -> Result<(), String> {
    if let Some(positions) = &patch.window_positions {
        for (window, position) in positions {
            if !matches!(
                window.as_str(),
                "recorder" | "countdown" | "settings" | "teleprompter" | "regionActions"
            ) || position.x.unsigned_abs() > 100_000
                || position.y.unsigned_abs() > 100_000
            {
                return Err("windowPositions contains an unsupported window or position".into());
            }
        }
    }
    if let Some(value) = &patch.locale {
        locale::validate(value)?;
    }
    if let Some(size) = patch.hud_window {
        validate_size(size)?;
    }
    if let Some(position) = patch.hud_position
        && (position.x.unsigned_abs() > 100_000 || position.y.unsigned_abs() > 100_000)
    {
        return Err("hudPosition is out of bounds".into());
    }
    if patch
        .countdown_seconds
        .is_some_and(|seconds| !(1..=10).contains(&seconds))
    {
        return Err("countdownSeconds must be 1–10".into());
    }
    if let Some(devices) = &patch.devices
        && [&devices.camera, &devices.microphone, &devices.system_audio]
            .into_iter()
            .flatten()
            .any(|id| id.len() > 1024)
    {
        return Err("device ID is too long".into());
    }
    if let Some(shortcuts) = &patch.shortcuts {
        for (id, keys) in shortcuts {
            if !DEFAULT_SHORTCUTS.iter().any(|(known, _)| id == known) {
                return Err(format!("unsupported shortcut: {id}"));
            }
            validate_shortcut(keys)?;
        }
    }
    if let Some(script) = &patch.teleprompter_document {
        teleprompter::validate(script)?;
    }
    Ok(())
}
fn validate_shortcut(keys: &str) -> Result<(), String> {
    if keys.is_empty() || keys.len() > 80 {
        return Err("shortcut is empty or too long".into());
    }
    Ok(())
}
fn validate_size(size: WindowSize) -> Result<(), String> {
    if !(HUD_MIN_SIZE.0..=HUD_MAX_SIZE.0).contains(&size.width)
        || !(HUD_MIN_SIZE.1..=HUD_MAX_SIZE.1).contains(&size.height)
    {
        return Err("hudWindow size is out of bounds".into());
    }
    Ok(())
}
fn save_size(document: &mut PreferenceDocument, size: WindowSize) {
    document.hud_window = Some(size);
    document
        .extras
        .get_or_insert_default()
        .native_hud_layout_version = Some(Value::from(HUD_LAYOUT_VERSION));
}
fn apply_patch(document: &mut PreferenceDocument, patch: PreferencePatch) {
    if let Some(locale) = patch.locale {
        document.extras.get_or_insert_default().locale = Some(locale);
    }
    if let Some(theme) = patch.theme {
        document.theme = Some(theme);
    }
    if let Some(mode) = patch.capture_mode {
        document.extras.get_or_insert_default().capture_mode = Some(match mode {
            CaptureMode::Recorder => StoredCaptureMode::Studio,
            CaptureMode::Screenshot => StoredCaptureMode::Screenshot,
            CaptureMode::Instant => StoredCaptureMode::Instant,
        });
    }
    if let Some(size) = patch.hud_window {
        save_size(document, size);
    }
    if let Some(position) = patch.hud_position {
        document.extras.get_or_insert_default().native_hud_position = Some(position);
    }
    if let Some(positions) = patch.window_positions {
        document
            .extras
            .get_or_insert_default()
            .native_window_positions
            .get_or_insert_default()
            .extend(positions);
    }
    if let Some(seconds) = patch.countdown_seconds {
        document
            .extras
            .get_or_insert_default()
            .native_countdown_seconds = Some(seconds);
    }
    if let Some(hidden) = patch.hide_taskbar {
        document.extras.get_or_insert_default().native_hide_taskbar = Some(hidden);
    }
    if let Some(hidden) = patch.hide_desktop_icons {
        document
            .extras
            .get_or_insert_default()
            .native_hide_desktop_icons = Some(hidden);
    }
    if let Some(devices) = patch.devices {
        let stored = document.devices.get_or_insert_default();
        if let Some(id) = devices.camera {
            stored.camera_id = Some(normalize_device(&id));
        }
        if let Some(id) = devices.microphone {
            stored.mic_id = Some(normalize_device(&id));
        }
        if let Some(id) = devices.system_audio {
            let id = if normalize_device(&id).is_empty() {
                String::new()
            } else {
                "default".into()
            };
            stored.system_audio_mode = Some(if id.is_empty() {
                AudioMode::Off
            } else {
                AudioMode::On
            });
            document
                .extras
                .get_or_insert_default()
                .native_system_audio_id = Some(id);
        }
    }
    if let Some(shortcuts) = patch.shortcuts {
        let stored = document.shortcuts.get_or_insert_default();
        for (id, keys) in shortcuts {
            stored.entry(id).or_default().keys = Some(keys);
        }
    }
    if let Some(script) = patch.teleprompter_document {
        let extras = document.extras.get_or_insert_default();
        extras.teleprompter_settings = Some(script.settings.clone());
        extras.native_teleprompter_document = Some(script);
    }
}
fn legacy_hud_layout(document: &PreferenceDocument) -> bool {
    document.hud_window.is_some()
        && document
            .extras
            .as_ref()
            .and_then(|extras| extras.native_hud_layout_version.as_ref())
            .and_then(Value::as_u64)
            .unwrap_or(0)
            < HUD_LAYOUT_VERSION
}
fn view_of(document: &PreferenceDocument) -> Result<NativePreferences, String> {
    let empty_extras = stored_types::StoredExtras::default();
    let extras = document.extras.as_ref().unwrap_or(&empty_extras);
    let empty_devices = stored_types::StoredDevices::default();
    let devices = document.devices.as_ref().unwrap_or(&empty_devices);
    let hud_window = if legacy_hud_layout(document) {
        WindowSize::default()
    } else {
        document.hud_window.unwrap_or_default()
    };
    validate_size(hud_window)?;
    let countdown_seconds = extras
        .native_countdown_seconds
        .unwrap_or(DEFAULT_COUNTDOWN_SECONDS);
    if !(1..=10).contains(&countdown_seconds) {
        return Err("countdownSeconds must be 1–10".into());
    }
    let shortcuts = DEFAULT_SHORTCUTS
        .into_iter()
        .map(|(id, fallback)| {
            let keys = document
                .shortcuts
                .as_ref()
                .and_then(|shortcuts| shortcuts.get(id))
                .and_then(|entry| entry.keys.clone())
                .unwrap_or_else(|| fallback.to_owned());
            validate_shortcut(&keys)?;
            Ok((id.to_owned(), keys))
        })
        .collect::<Result<_, String>>()?;
    Ok(NativePreferences {
        theme: document.theme.unwrap_or_default(),
        locale: locale::stored(extras.locale.as_deref()),
        capture_mode: match extras.capture_mode {
            Some(StoredCaptureMode::Studio) | None => CaptureMode::Recorder,
            Some(StoredCaptureMode::Screenshot) => CaptureMode::Screenshot,
            Some(StoredCaptureMode::Instant) => CaptureMode::Instant,
        },
        hud_window,
        hud_position: extras.native_hud_position,
        window_positions: extras.native_window_positions.clone().unwrap_or_default(),
        shortcuts,
        countdown_seconds,
        hide_taskbar: extras.native_hide_taskbar.unwrap_or(false),
        hide_desktop_icons: extras.native_hide_desktop_icons.unwrap_or(false),
        devices: Devices {
            camera: normalize_device(devices.camera_id.as_deref().unwrap_or_default()),
            microphone: normalize_device(devices.mic_id.as_deref().unwrap_or_default()),
            system_audio: match devices.system_audio_mode {
                Some(AudioMode::On) => "default".into(),
                _ => String::new(),
            },
        },
    })
}

fn normalize_device(id: &str) -> String {
    match id {
        "off" | "no-audio" => String::new(),
        _ => id.to_owned(),
    }
}
