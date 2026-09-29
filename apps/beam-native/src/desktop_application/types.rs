//! Serializable window events and presentation state at the native UI boundary.

use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct NativeUiState {
    pub remaining: u8,
    pub shortcut: String,
    pub pause_shortcut: String,
    pub microphone_enabled: bool,
    pub system_audio_enabled: bool,
    pub camera_enabled: bool,
    pub preparation_source: PreparationSource,
    pub paused: bool,
    pub busy: bool,
    pub region_revision: u64,
}
impl Default for NativeUiState {
    fn default() -> Self {
        Self {
            remaining: 3,
            shortcut: "Alt+Shift+R".into(),
            pause_shortcut: "Alt+Shift+P".into(),
            microphone_enabled: false,
            system_audio_enabled: false,
            camera_enabled: false,
            preparation_source: PreparationSource::Region,
            paused: false,
            busy: false,
            region_revision: 0,
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct UiStatePatch {
    pub remaining: Option<u8>,
    pub shortcut: Option<String>,
    pub pause_shortcut: Option<String>,
    pub microphone_enabled: Option<bool>,
    pub system_audio_enabled: Option<bool>,
    pub camera_enabled: Option<bool>,
    pub preparation_source: Option<PreparationSource>,
    pub paused: Option<bool>,
    pub busy: Option<bool>,
    pub region_revision: Option<u64>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct RegionBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
#[derive(Clone, Copy, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(super) enum UiAction {
    RegionSelected,
    RegionCanceled,
    WindowSelected,
    WindowCanceled,
    CountdownCanceled,
    Pause,
    Reset,
    Stop,
    Delete,
    PreparationRecord,
    PreparationCanceled,
    EditorLoadingCanceled,
}

/// Source represented by the shared preparation bar, before devices are opened.
#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum PreparationSource {
    Display,
    Region,
    Window,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct UiActionRequest {
    pub action: UiAction,
    pub region: Option<RegionBounds>,
}
#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum ShortcutState {
    Pressed,
    Released,
}

#[derive(Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(super) enum NativeEvent {
    PreferencesChanged {
        preferences: serde_json::Value,
    },
    SystemScheme {
        scheme: String,
    },
    WindowResized {
        window: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        physical_width: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        physical_height: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        scale_factor: Option<f64>,
    },
    WindowVisibility {
        window: String,
        visible: bool,
    },
    WindowMoved {
        window: String,
        x: i32,
        y: i32,
    },
    Menu {
        id: String,
    },
    Shortcut {
        id: String,
        state: ShortcutState,
    },
    ShortcutError {
        message: String,
    },
    TrayError {
        message: String,
    },
    WindowAppearanceError {
        window: String,
        message: String,
    },
    BeamUi {
        action: UiAction,
        #[serde(skip_serializing_if = "Option::is_none")]
        region: Option<RegionBounds>,
        #[serde(skip_serializing_if = "Option::is_none")]
        source_id: Option<String>,
    },
    BeamUiState {
        value: NativeUiState,
    },
    WindowPickerOpened,
    RegionChanged {
        snapshot: super::region::RegionSnapshot,
    },
}
#[derive(Serialize)]
pub(super) struct WindowChoice {
    pub generation: u64,
    pub id: String,
    pub label: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub(super) enum AssetReference {
    Image { id: u64 },
}
