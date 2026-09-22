#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;

#[test]
fn core_audio_status_error_keeps_the_operation_and_status() {
    let error = os_error("create tap", -50);
    assert!(error.to_string().contains("create tap"));
    assert!(error.to_string().contains("-50"));
}

#[test]
fn core_audio_tap_distinguishes_permission_and_missing_output() {
    assert!(matches!(
        os_error("create tap", kAudioDevicePermissionsError),
        AudioError::PermissionDenied(_)
    ));
    assert!(matches!(
        os_error("create tap", kAudioHardwareBadDeviceError),
        AudioError::DeviceUnavailable(_)
    ));
}

#[test]
fn aggregate_properties_can_be_built_without_opening_an_audio_device() {
    let tap_uid = NSString::from_str("test-tap-uid");
    let properties = aggregate_properties("test-aggregate-uid", "Beam test", &tap_uid)
        .expect("Core Audio aggregate properties");
    assert_eq!(properties.count(), 5);
}
