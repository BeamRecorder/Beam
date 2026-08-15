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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "kebab-case")]
pub enum SystemAudioSelection {
    DefaultOutput,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenRegion {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl ScreenRegion {
    pub fn validate(self) -> Result<(), crate::CaptureError> {
        let values = [self.x, self.y, self.width, self.height];
        if !values.iter().all(|value| value.is_finite())
            || self.x < 0.0
            || self.y < 0.0
            || self.width <= 0.0
            || self.height <= 0.0
            || self.x + self.width > 1.0
            || self.y + self.height > 1.0
        {
            return Err(crate::CaptureError::InvalidConfiguration(
                "screen region must be a finite rectangle inside the screen".into(),
            ));
        }
        Ok(())
    }

    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    pub fn pixel_rect(
        self,
        width: u32,
        height: u32,
    ) -> Result<(u32, u32, u32, u32), crate::CaptureError> {
        self.validate()?;
        let x = (self.x * f64::from(width))
            .round()
            .clamp(0.0, f64::from(width.saturating_sub(1))) as u32;
        let y = (self.y * f64::from(height))
            .round()
            .clamp(0.0, f64::from(height.saturating_sub(1))) as u32;
        let right = ((self.x + self.width) * f64::from(width))
            .round()
            .clamp(f64::from(x + 1), f64::from(width)) as u32;
        let bottom = ((self.y + self.height) * f64::from(height))
            .round()
            .clamp(f64::from(y + 1), f64::from(height)) as u32;
        Ok((x, y, right, bottom))
    }
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
        #[serde(default)]
        capture_shortcuts: bool,
        capture_shape: bool,
    },
}

impl Default for CursorSelection {
    fn default() -> Self {
        Self::Separate {
            capture_clicks: true,
            capture_shortcuts: true,
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRequest {
    pub project_id: ProjectId,
    pub screen: Option<ScreenSelection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub system_audio: Option<SystemAudioSelection>,
    #[serde(default)]
    pub cursor: CursorSelection,
    #[serde(default)]
    pub recording: RecordingSettings,
    pub failure_policy: FailurePolicy,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub region: Option<ScreenRegion>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub excluded_process_id: Option<u32>,
}

impl CaptureRequest {
    pub fn validate_basic(&self) -> Result<(), crate::CaptureError> {
        if self.screen.is_none() && !matches!(self.cursor, CursorSelection::Disabled) {
            return Err(crate::CaptureError::InvalidConfiguration(
                "cursor capture requires a screen source".into(),
            ));
        }
        if let Some(region) = self.region {
            region.validate()?;
            if !matches!(self.screen, Some(ScreenSelection::Source { .. })) {
                return Err(crate::CaptureError::InvalidConfiguration(
                    "screen region requires a direct screen source".into(),
                ));
            }
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
