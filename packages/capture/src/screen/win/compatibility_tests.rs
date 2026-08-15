use std::time::Duration;

use super::{FeatureSupport, settings_for_support};
use windows_capture::settings::{
    CursorCaptureSettings, DrawBorderSettings, MinimumUpdateIntervalSettings,
    SecondaryWindowSettings,
};

#[test]
fn unsupported_features_use_default_settings() {
    let settings = settings_for_support(
        true,
        60,
        FeatureSupport {
            cursor: false,
            border: false,
            secondary_windows: false,
            minimum_update_interval: false,
        },
    );

    assert_eq!(settings.cursor, CursorCaptureSettings::Default);
    assert_eq!(settings.border, DrawBorderSettings::Default);
    assert_eq!(settings.secondary_windows, SecondaryWindowSettings::Default);
    assert_eq!(
        settings.minimum_update_interval,
        MinimumUpdateIntervalSettings::Default
    );
}

#[test]
fn supported_features_select_requested_compatible_settings() {
    let support = FeatureSupport {
        cursor: true,
        border: true,
        secondary_windows: true,
        minimum_update_interval: true,
    };

    let without_cursor = settings_for_support(true, 60, support);
    assert_eq!(without_cursor.cursor, CursorCaptureSettings::WithoutCursor);
    assert_eq!(without_cursor.border, DrawBorderSettings::WithoutBorder);
    assert_eq!(
        without_cursor.secondary_windows,
        SecondaryWindowSettings::Exclude
    );
    assert_eq!(
        without_cursor.minimum_update_interval,
        MinimumUpdateIntervalSettings::Custom(Duration::from_secs_f64(1.0 / 60.0))
    );

    let with_cursor = settings_for_support(false, 60, support);
    assert_eq!(with_cursor.cursor, CursorCaptureSettings::WithCursor);
    assert_eq!(with_cursor.border, DrawBorderSettings::WithoutBorder);
    assert_eq!(
        with_cursor.secondary_windows,
        SecondaryWindowSettings::Exclude
    );
    assert_eq!(
        with_cursor.minimum_update_interval,
        MinimumUpdateIntervalSettings::Custom(Duration::from_secs_f64(1.0 / 60.0))
    );
}
