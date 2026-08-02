use serde::{Deserialize, Serialize};

use super::SourceId;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SourceKind {
    Display,
    Window,
    Application,
    Camera,
    Microphone,
    SystemAudio,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SourceSelectionMode {
    Direct,
    SystemPicker,
    Portal,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCapabilities {
    pub formats: Vec<MediaFormat>,
    pub supports_cursor_exclusion: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum MediaFormat {
    Video {
        width: u32,
        height: u32,
        fps: u32,
        pixel_format: Option<String>,
    },
    Audio {
        sample_rate: u32,
        channels: u16,
        sample_format: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDescriptor {
    pub id: SourceId,
    pub kind: SourceKind,
    pub label: String,
    pub is_default: bool,
    pub selection_mode: SourceSelectionMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_id: Option<String>,
    pub capabilities: SourceCapabilities,
}
