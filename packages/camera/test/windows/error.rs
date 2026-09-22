#![cfg(test)]

use super::*;

#[test]
fn access_denied_hresult_is_distinct_from_a_missing_camera() {
    let denied = camera_windows_error(
        windows::core::Error::from(E_ACCESSDENIED),
        "activating camera",
        CameraError::DeviceUnavailable,
    );
    assert!(matches!(denied, CameraError::PermissionDenied(_)));
    let absent = camera_windows_error(
        windows::core::Error::from(windows::core::HRESULT(0x8000_4005_u32 as i32)),
        "activating camera",
        CameraError::DeviceUnavailable,
    );
    assert!(matches!(absent, CameraError::DeviceUnavailable(_)));
}
