//! Versioned sequence profiles and explicit per-occurrence cursor overrides.
use serde::{Deserialize, Serialize};

#[derive(
    Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema,
)]
#[serde(rename_all = "camelCase")]
pub enum CursorMode {
    Separated,
    BakedIn,
    Absent,
    #[default]
    Unknown,
}

#[derive(
    Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema,
)]
#[serde(rename_all = "camelCase")]
pub enum CursorShape {
    #[default]
    Pointer,
    Dot,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CursorStyle {
    pub enabled: bool,
    pub shape: CursorShape,
    /// Cursor height in immutable source pixels.
    pub size: f64,
    pub color: [f64; 4],
    pub border_color: [f64; 4],
    pub smoothing_ms: u64,
    /// Zero disables automatic hiding.
    pub hide_after_ms: u64,
    pub clicks: bool,
    #[serde(default)]
    pub selection: super::cursor_style_types::CursorSelection,
    #[serde(default)]
    pub shadow: super::cursor_style_types::CursorShadow,
    #[serde(default)]
    pub motion: super::cursor_style_types::CursorMotion,
    #[serde(default)]
    pub click_effects: super::cursor_style_types::CursorClickEffects,
    #[serde(default = "default_fade")]
    pub fade_duration_ms: u64,
}
impl Default for CursorStyle {
    fn default() -> Self {
        Self {
            enabled: true,
            shape: CursorShape::Pointer,
            size: 45.,
            color: [0., 0., 0., 1.],
            border_color: [0.08, 0.08, 0.08, 1.],
            smoothing_ms: 60,
            hide_after_ms: 0,
            clicks: true,
            selection: Default::default(),
            shadow: Default::default(),
            motion: Default::default(),
            click_effects: Default::default(),
            fade_duration_ms: default_fade(),
        }
    }
}

/// Absent fields continue inheriting future changes to the sequence profile.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CursorStyleOverride {
    pub enabled: Option<bool>,
    pub shape: Option<CursorShape>,
    pub size: Option<f64>,
    pub color: Option<[f64; 4]>,
    pub border_color: Option<[f64; 4]>,
    pub smoothing_ms: Option<u64>,
    pub hide_after_ms: Option<u64>,
    pub clicks: Option<bool>,
    pub selection: Option<super::cursor_style_types::CursorSelection>,
    pub shadow: Option<super::cursor_style_types::CursorShadow>,
    pub motion: Option<super::cursor_style_types::CursorMotion>,
    pub click_effects: Option<super::cursor_style_types::CursorClickEffects>,
    pub fade_duration_ms: Option<u64>,
}
fn default_fade() -> u64 {
    250
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ZoomDefaults {
    pub scale: f64,
    pub entry_ms: u64,
    pub exit_ms: u64,
    pub follow_cursor: bool,
}
impl Default for ZoomDefaults {
    fn default() -> Self {
        Self {
            scale: 2.,
            entry_ms: 500,
            exit_ms: 500,
            follow_cursor: true,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecordingStyle {
    pub version: u32,
    pub cursor: CursorStyle,
    pub zoom: ZoomDefaults,
}
impl Default for RecordingStyle {
    fn default() -> Self {
        Self {
            version: 1,
            cursor: CursorStyle::default(),
            zoom: ZoomDefaults::default(),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CursorSample {
    pub x: f64,
    pub y: f64,
    pub opacity: f64,
    /// Progress of the most recent captured click; None means no active click.
    pub click: Option<f64>,
}

/// Derived immutable telemetry index, shared by every occurrence of one asset.
#[derive(Clone, Debug, Default)]
pub struct CursorIndex {
    pub activity: Vec<u64>,
    pub clicks: Vec<u64>,
    pub motion: Vec<super::cursor_motion_types::MotionKey>,
    pub settings: super::cursor_style_types::CursorMotion,
}
