//! Versioned process boundary. Native hosts can call RecordingController directly.
use crate::{
    AudioSelection, CameraSelection, ProjectId, RecordingConfig, ScreenRequest, SessionId,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "mode",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum AudioConfig {
    Disabled,
    Default,
    Device { device_id: String },
}
impl From<AudioConfig> for AudioSelection {
    fn from(value: AudioConfig) -> Self {
        match value {
            AudioConfig::Disabled => Self::Disabled,
            AudioConfig::Default => Self::Default,
            AudioConfig::Device { device_id } => Self::Device(device_id),
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "mode",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum CameraConfig {
    Disabled,
    Default {
        width: u32,
        height: u32,
        fps: u32,
    },
    Device {
        device_id: String,
        width: u32,
        height: u32,
        fps: u32,
    },
}
impl From<CameraConfig> for CameraSelection {
    fn from(value: CameraConfig) -> Self {
        match value {
            CameraConfig::Disabled => Self::Disabled,
            CameraConfig::Default { width, height, fps } => {
                Self::FirstAvailable { width, height, fps }
            }
            CameraConfig::Device {
                device_id,
                width,
                height,
                fps,
            } => Self::Device(beam_camera::CameraRequest {
                device_id,
                width,
                height,
                fps,
            }),
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    #[serde(default)]
    pub output: crate::OutputLocation,
    pub project_id: ProjectId,
    pub screen: Option<ScreenRequest>,
    pub camera: CameraConfig,
    pub microphone: AudioConfig,
    pub system_audio: AudioConfig,
}
impl From<Config> for RecordingConfig {
    fn from(value: Config) -> Self {
        Self {
            output: value.output,
            project_id: value.project_id,
            screen: value.screen,
            camera: value.camera.into(),
            microphone: value.microphone.into(),
            system_audio: value.system_audio.into(),
        }
    }
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub version: u32,
    pub id: String,
    pub command: Command,
}
#[derive(Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Command {
    Sources {},
    Capabilities {},
    Permissions {},
    Prepare {
        config: Config,
    },
    Start {
        session_id: SessionId,
    },
    Pause {
        session_id: SessionId,
    },
    Resume {
        session_id: SessionId,
    },
    Restart {
        session_id: SessionId,
    },
    Stop {
        session_id: SessionId,
    },
    Cancel {
        session_id: SessionId,
    },
    Status {},
    Events {
        after_sequence: u64,
    },
    Levels {
        session_id: SessionId,
    },
    ScreenPreview {
        session_id: SessionId,
    },
    CameraPreview {
        session_id: SessionId,
    },
    Screenshot {
        config: crate::StillConfig,
    },
    SourcePreview {
        source_id: String,
        width: u32,
        height: u32,
    },
    ResolveDisplay {
        x: i32,
        y: i32,
    },
    InputAccess {},
    RequestInputAccess {},
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    pub version: u32,
    pub request_id: String,
    pub ok: bool,
    pub result: Option<serde_json::Value>,
    pub error: Option<ProtocolError>,
}

#[derive(Debug, Serialize)]
pub struct ProtocolError {
    pub code: String,
    pub message: String,
}
