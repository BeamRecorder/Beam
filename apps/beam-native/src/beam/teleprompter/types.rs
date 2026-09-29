//! The persisted teleprompter schema, including its actual reader defaults.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ReadingMode {
    #[default]
    Continuous,
    LineByLine,
}
#[derive(Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum TextAlign {
    #[default]
    Left,
    Center,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TeleprompterSettings {
    pub mode: ReadingMode,
    pub autoscroll: bool,
    pub scroll_speed: f64,
    pub font_size: u32,
    pub line_height: f64,
    pub text_align: TextAlign,
    #[serde(default = "default_text_color")]
    pub text_color: String,
    /// True follows theme contrast; absent legacy values retain custom colors
    /// while the original opaque-white default follows the current foreground.
    #[serde(default)]
    pub use_theme_text_color: Option<bool>,
    #[serde(default = "default_window_opacity")]
    pub window_opacity: f64,
}

fn default_text_color() -> String {
    "#ffffffff".into()
}

fn default_window_opacity() -> f64 {
    0.94
}

impl Default for TeleprompterSettings {
    fn default() -> Self {
        Self {
            mode: ReadingMode::Continuous,
            autoscroll: true,
            scroll_speed: 42.0,
            font_size: 36,
            line_height: 1.35,
            text_align: TextAlign::Left,
            text_color: default_text_color(),
            use_theme_text_color: Some(true),
            window_opacity: default_window_opacity(),
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TeleprompterDocument {
    pub schema_version: u32,
    pub text: String,
    #[serde(flatten)]
    pub settings: TeleprompterSettings,
    pub theme: super::super::preferences::Theme,
    pub updated_at_utc: String,
}

impl Default for TeleprompterDocument {
    fn default() -> Self {
        Self {
            schema_version: 1,
            text: String::new(),
            settings: TeleprompterSettings::default(),
            theme: super::super::preferences::Theme::System,
            updated_at_utc: time::OffsetDateTime::now_utc()
                .format(&time::format_description::well_known::Rfc3339)
                .expect("UTC timestamp formatting is supported"),
        }
    }
}
