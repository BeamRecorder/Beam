use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Cross-platform native media selection for the capture engine protocol.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeMediaConfig {
    pub output_dir: PathBuf,
    pub camera: NativeCameraSelection,
    pub microphone: NativeAudioSelection,
    pub system_audio: NativeAudioSelection,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "kebab-case")]
pub enum NativeCameraSelection {
    Disabled,
    FirstAvailable {
        width: u32,
        height: u32,
        fps: u32,
    },
    Device {
        id: String,
        width: u32,
        height: u32,
        fps: u32,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "kebab-case")]
pub enum NativeAudioSelection {
    Disabled,
    Default,
    Device { id: String },
}

#[path = "../../test/protocol/native_media.rs"]
mod native_media_checks;
