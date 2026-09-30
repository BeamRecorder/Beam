//! Resolves inherited profiles without copying them into every clip.
use super::style_types::{CursorStyle, CursorStyleOverride, RecordingStyle, ZoomDefaults};
use crate::{EditorError, Result};

impl CursorStyle {
    pub fn overridden(&self, value: Option<&CursorStyleOverride>) -> Self {
        let Some(v) = value else { return self.clone() };
        Self {
            enabled: v.enabled.unwrap_or(self.enabled),
            shape: v.shape.unwrap_or(self.shape),
            size: v.size.unwrap_or(self.size),
            color: v.color.unwrap_or(self.color),
            border_color: v.border_color.unwrap_or(self.border_color),
            smoothing_ms: v.smoothing_ms.unwrap_or(self.smoothing_ms),
            hide_after_ms: v.hide_after_ms.unwrap_or(self.hide_after_ms),
            clicks: v.clicks.unwrap_or(self.clicks),
            selection: v
                .selection
                .clone()
                .unwrap_or_else(|| self.selection.clone()),
            shadow: v.shadow.clone().unwrap_or_else(|| self.shadow.clone()),
            motion: v.motion.clone().unwrap_or_else(|| self.motion.clone()),
            click_effects: v
                .click_effects
                .clone()
                .unwrap_or_else(|| self.click_effects.clone()),
            fade_duration_ms: v.fade_duration_ms.unwrap_or(self.fade_duration_ms),
        }
    }
    pub fn validate(&self) -> Result<()> {
        super::cursor_style::validate(self)?;
        if !self.size.is_finite()
            || !(1. ..=256.).contains(&self.size)
            || self
                .color
                .iter()
                .chain(&self.border_color)
                .any(|v| !v.is_finite() || !(0. ..=1.).contains(v))
            || self.smoothing_ms > 1000
            || self.hide_after_ms > 60_000
        {
            return Err(EditorError::Invalid(
                "cursor profile contains invalid size, color or timing".into(),
            ));
        }
        Ok(())
    }
}
impl RecordingStyle {
    pub fn validate(&self) -> Result<()> {
        if self.version != 1 {
            return Err(EditorError::Invalid(
                "recording profile version or zoom defaults are invalid".into(),
            ));
        }
        self.zoom.validate()?;
        self.cursor.validate()
    }
}
impl ZoomDefaults {
    pub fn validate(&self) -> Result<()> {
        if !self.scale.is_finite()
            || !(1. ..=5.).contains(&self.scale)
            || self.entry_ms > 10_000
            || self.exit_ms > 10_000
        {
            return Err(EditorError::Invalid(
                "zoom defaults contain invalid scale or timing".into(),
            ));
        }
        Ok(())
    }
}
