//! Typed native preference view and patch; unrelated editor keys stay in storage.

use super::super::teleprompter::types::TeleprompterDocument;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Theme {
    Light,
    Dark,
    #[default]
    System,
}
#[derive(Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum CaptureMode {
    #[default]
    Recorder,
    Screenshot,
    Instant,
}
#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct WindowSize {
    pub width: u64,
    pub height: u64,
}
impl Default for WindowSize {
    fn default() -> Self {
        Self {
            width: super::HUD_MAX_SIZE.0,
            height: super::HUD_MAX_SIZE.1,
        }
    }
}
#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct WindowPosition {
    pub x: i64,
    pub y: i64,
}
#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Devices {
    pub camera: String,
    pub microphone: String,
    pub system_audio: String,
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DevicePatch {
    pub camera: Option<String>,
    pub microphone: Option<String>,
    pub system_audio: Option<String>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativePreferences {
    pub theme: Theme,
    pub locale: String,
    pub capture_mode: CaptureMode,
    pub hud_window: WindowSize,
    pub hud_position: Option<WindowPosition>,
    pub shortcuts: BTreeMap<String, String>,
    pub devices: Devices,
    pub countdown_seconds: u8,
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PreferencePatch {
    pub theme: Option<Theme>,
    pub locale: Option<String>,
    pub capture_mode: Option<CaptureMode>,
    pub hud_window: Option<WindowSize>,
    pub hud_position: Option<WindowPosition>,
    pub shortcuts: Option<BTreeMap<String, String>>,
    pub devices: Option<DevicePatch>,
    pub countdown_seconds: Option<u8>,
    pub teleprompter_document: Option<TeleprompterDocument>,
}
pub(crate) const DEFAULT_SHORTCUTS: [(&str, &str); 6] = [
    ("hud.startStopRecording", "Alt+Shift+R"),
    ("hud.playPause", "Alt+Shift+P"),
    ("teleprompter.toggleVisibility", "Alt+Shift+T"),
    ("teleprompter.toggleAutoscroll", "Alt+Shift+O"),
    ("teleprompter.nextLine", "Ctrl+Shift+Right"),
    ("teleprompter.previousLine", "Ctrl+Shift+Left"),
];
