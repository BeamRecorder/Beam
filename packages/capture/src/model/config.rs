use serde::{Deserialize, Serialize};

use super::{ProjectId, SourceId};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PortalSourceKind {
    Monitor,
    Window,
    MonitorOrWindow,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "mode",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum ScreenSelection {
    Source {
        source_id: SourceId,
    },
    Portal {
        kind: PortalSourceKind,
        restore_token: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "mode",
    content = "sourceId",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum SystemAudioSelection {
    DefaultMix,
    OutputDevice(SourceId),
    ScreenCaptureMix,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MicrophoneSelection {
    pub source_id: SourceId,
    pub preferred_sample_rate: Option<u32>,
    pub preferred_channels: Option<u16>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "mode",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum CursorSelection {
    Disabled,
    Embedded,
    Separate {
        capture_clicks: bool,
        capture_shape: bool,
    },
}

impl Default for CursorSelection {
    fn default() -> Self {
        Self::Separate {
            capture_clicks: true,
            capture_shape: true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FailurePolicy {
    FailFast,
    ContinueWithoutOptionalTracks,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingSettings {
    pub output_root: std::path::PathBuf,
    pub video_bitrate_bps: u64,
    pub target_fps: u32,
    pub keyframe_interval_seconds: u8,
    pub queue_capacity: usize,
    pub minimum_free_bytes: u64,
}

impl Default for RecordingSettings {
    fn default() -> Self {
        Self {
            output_root: "recordings".into(),
            video_bitrate_bps: 12_000_000,
            target_fps: 60,
            keyframe_interval_seconds: 2,
            queue_capacity: 8,
            minimum_free_bytes: 512 * 1024 * 1024,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRequest {
    pub project_id: ProjectId,
    pub screen: Option<ScreenSelection>,
    pub system_audio: Option<SystemAudioSelection>,
    pub microphone: Option<MicrophoneSelection>,
    #[serde(default)]
    pub cursor: CursorSelection,
    #[serde(default)]
    pub recording: RecordingSettings,
    pub failure_policy: FailurePolicy,
}

impl CaptureRequest {
    pub fn validate_basic(&self) -> Result<(), crate::CaptureError> {
        if self.screen.is_none() && !matches!(self.cursor, CursorSelection::Disabled) {
            return Err(crate::CaptureError::InvalidConfiguration(
                "cursor capture requires a screen source".into(),
            ));
        }
        if self.recording.target_fps == 0 || self.recording.queue_capacity == 0 {
            return Err(crate::CaptureError::InvalidConfiguration(
                "fps and queue capacity must be non-zero".into(),
            ));
        }
        if !(1..=2).contains(&self.recording.keyframe_interval_seconds) {
            return Err(crate::CaptureError::InvalidConfiguration(
                "keyframe interval must be one or two seconds".into(),
            ));
        }
        Ok(())
    }
}
