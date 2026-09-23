use serde::{Deserialize, Serialize};

use super::SourceId;

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
        if width == 0 || height == 0 {
            return Err(crate::CaptureError::InvalidConfiguration(
                "source dimensions must be positive".into(),
            ));
        }
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingSettings {
    pub target_fps: u32,
    pub queue_capacity: usize,
}

impl Default for RecordingSettings {
    fn default() -> Self {
        Self {
            target_fps: 60,
            queue_capacity: 8,
        }
    }
}
