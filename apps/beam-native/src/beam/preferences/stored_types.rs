//! Editor-compatible storage schemas; flattened fields preserve editor-owned data.

use super::super::teleprompter::types::{TeleprompterDocument, TeleprompterSettings};
use super::types::{Theme, WindowPosition, WindowSize};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreferenceDocument {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<Theme>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hud_window: Option<WindowSize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub devices: Option<StoredDevices>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shortcuts: Option<BTreeMap<String, ShortcutEntry>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extras: Option<StoredExtras>,
    #[serde(flatten)]
    pub editor_fields: BTreeMap<String, Value>,
}
#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredDevices {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub camera_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mic_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_audio_mode: Option<AudioMode>,
    #[serde(flatten)]
    pub editor_fields: BTreeMap<String, Value>,
}
#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum AudioMode {
    On,
    Off,
}
#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum StoredCaptureMode {
    #[serde(alias = "recorder")]
    Studio,
    Screenshot,
    Instant,
}
#[derive(Default, Deserialize, Serialize)]
pub(crate) struct ShortcutEntry {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keys: Option<String>,
    #[serde(flatten)]
    pub editor_fields: BTreeMap<String, Value>,
}
#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredExtras {
    #[serde(
        default,
        deserialize_with = "read_locale",
        skip_serializing_if = "Option::is_none"
    )]
    pub locale: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capture_mode: Option<StoredCaptureMode>,
    // Older native builds wrote this migration marker as a string.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_hud_layout_version: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_hud_position: Option<WindowPosition>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_window_positions: Option<BTreeMap<String, WindowPosition>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_countdown_seconds: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_hide_taskbar: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_hide_desktop_icons: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_system_audio_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_teleprompter_document: Option<TeleprompterDocument>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub teleprompter_settings: Option<TeleprompterSettings>,
    #[serde(flatten)]
    pub editor_fields: BTreeMap<String, Value>,
}

/// Legacy documents may contain invalid locale values; keep the rest readable.
fn read_locale<'de, D: serde::Deserializer<'de>>(reader: D) -> Result<Option<String>, D::Error> {
    Ok(Value::deserialize(reader)?.as_str().map(str::to_owned))
}
