//! Cursor presentation shared by native preview, export and saved editor profiles.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CursorSelection {
    pub pack_id: String,
    pub mode: SelectionMode,
    pub cursor_id: Option<String>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum SelectionMode {
    Automatic,
    Fixed,
}
impl Default for CursorSelection {
    fn default() -> Self {
        Self {
            pack_id: "builtin:macos".into(),
            mode: SelectionMode::Automatic,
            cursor_id: None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CursorShadow {
    pub enabled: bool,
    pub blur: f64,
    pub color: [f64; 4],
    pub direction: ShadowDirection,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum ShadowDirection {
    All,
    Bottom,
    BottomRight,
    TopLeft,
}
impl Default for CursorShadow {
    fn default() -> Self {
        Self {
            enabled: true,
            blur: 6.,
            color: [0., 0., 0., 1.],
            direction: ShadowDirection::Bottom,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CursorMotion {
    pub preset: MotionPreset,
    pub smoothing: f64,
    pub spring_mass_multiplier: f64,
    pub motion_blur: f64,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum MotionPreset {
    Focused,
    Smooth,
    Custom,
}
impl Default for CursorMotion {
    fn default() -> Self {
        Self {
            preset: MotionPreset::Smooth,
            smoothing: 0.67,
            spring_mass_multiplier: 1.29,
            motion_blur: 0.4,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClickEffect {
    pub spring_enabled: bool,
    pub spring_intensity: f64,
    pub ripple_enabled: bool,
    pub ripple_style: RippleStyle,
    pub ripple_size: f64,
    pub ripple_color: [f64; 4],
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum RippleStyle {
    None,
    Single,
    Double,
    Solid,
}
impl Default for ClickEffect {
    fn default() -> Self {
        Self {
            spring_enabled: true,
            spring_intensity: 50.,
            ripple_enabled: false,
            ripple_style: RippleStyle::Single,
            ripple_size: 30.,
            ripple_color: [1., 90. / 255., 31. / 255., 1.],
        }
    }
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CursorClickEffects {
    pub left: ClickEffect,
    pub right: ClickEffect,
}
impl Default for CursorClickEffects {
    fn default() -> Self {
        Self {
            left: ClickEffect::default(),
            right: ClickEffect {
                ripple_color: [99. / 255., 102. / 255., 241. / 255., 1.],
                ..ClickEffect::default()
            },
        }
    }
}
