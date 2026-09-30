//! Read-only import of the original editor's saved cursor presentation.
use beam_editor_domain::recording::cursor_style_types::{
    CursorMotion, CursorSelection, RippleStyle, ShadowDirection,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Presentation {
    pub selection: CursorSelection,
    pub size: f64,
    pub color: String,
    pub shadow: Shadow,
    pub motion: CursorMotion,
    pub click_effects: ClickEffects,
    #[serde(default)]
    pub auto_hide: AutoHide,
}
#[derive(Deserialize)]
pub struct Shadow {
    pub enabled: bool,
    pub blur: f64,
    pub color: String,
    pub direction: ShadowDirection,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Click {
    pub spring_enabled: bool,
    pub spring_intensity: f64,
    pub ripple_enabled: bool,
    #[serde(default = "single")]
    pub ripple_style: RippleStyle,
    pub ripple_size: f64,
    pub ripple_color: String,
}
fn single() -> RippleStyle {
    RippleStyle::Single
}
#[derive(Deserialize)]
pub struct ClickEffects {
    pub left: Click,
    pub right: Click,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoHide {
    pub enabled: bool,
    pub delay_seconds: f64,
    pub fade_duration_ms: u64,
}
impl Default for AutoHide {
    fn default() -> Self {
        Self {
            enabled: false,
            delay_seconds: 2.,
            fade_duration_ms: 250,
        }
    }
}
