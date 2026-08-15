use std::time::Duration;

use windows_capture::{
    graphics_capture_api::GraphicsCaptureApi,
    settings::{
        CursorCaptureSettings, DrawBorderSettings, MinimumUpdateIntervalSettings,
        SecondaryWindowSettings,
    },
};

#[derive(Clone, Copy)]
struct FeatureSupport {
    cursor: bool,
    border: bool,
    secondary_windows: bool,
    minimum_update_interval: bool,
}

pub(super) struct CompatibleSettings {
    pub(super) cursor: CursorCaptureSettings,
    pub(super) border: DrawBorderSettings,
    pub(super) secondary_windows: SecondaryWindowSettings,
    pub(super) minimum_update_interval: MinimumUpdateIntervalSettings,
}

fn feature_support() -> FeatureSupport {
    FeatureSupport {
        cursor: GraphicsCaptureApi::is_cursor_settings_supported().unwrap_or(false),
        border: GraphicsCaptureApi::is_border_settings_supported().unwrap_or(false),
        secondary_windows: GraphicsCaptureApi::is_secondary_windows_supported().unwrap_or(false),
        minimum_update_interval: GraphicsCaptureApi::is_minimum_update_interval_supported()
            .unwrap_or(false),
    }
}

pub(super) fn supports_cursor_exclusion() -> bool {
    feature_support().cursor
}

pub(super) fn compatible_settings(exclude_cursor: bool, fps: u32) -> CompatibleSettings {
    settings_for_support(exclude_cursor, fps, feature_support())
}

fn settings_for_support(
    exclude_cursor: bool,
    fps: u32,
    support: FeatureSupport,
) -> CompatibleSettings {
    CompatibleSettings {
        cursor: if support.cursor {
            if exclude_cursor {
                CursorCaptureSettings::WithoutCursor
            } else {
                CursorCaptureSettings::WithCursor
            }
        } else {
            CursorCaptureSettings::Default
        },
        border: if support.border {
            DrawBorderSettings::WithoutBorder
        } else {
            DrawBorderSettings::Default
        },
        secondary_windows: if support.secondary_windows {
            SecondaryWindowSettings::Exclude
        } else {
            SecondaryWindowSettings::Default
        },
        minimum_update_interval: if support.minimum_update_interval {
            MinimumUpdateIntervalSettings::Custom(Duration::from_secs_f64(1.0 / f64::from(fps)))
        } else {
            MinimumUpdateIntervalSettings::Default
        },
    }
}

#[cfg(test)]
#[path = "compatibility_tests.rs"]
mod tests;
