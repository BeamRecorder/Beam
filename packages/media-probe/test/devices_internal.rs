#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;

#[test]
fn camera_permission_failure_does_not_hide_audio_devices() {
    let rendered = catalog(
        Err(CameraError::PermissionDenied(
            "camera access rejected".into(),
        )),
        Ok(vec![AudioDevice {
            id: "microphone-1".into(),
            name: "Microphone".into(),
            is_default: true,
        }]),
        Ok(vec![AudioDevice {
            id: "output-1".into(),
            name: "Speakers".into(),
            is_default: true,
        }]),
    );
    assert_eq!(rendered["cameras"], serde_json::json!([]));
    assert!(
        rendered["errors"]["cameras"]
            .as_str()
            .expect("camera error")
            .contains("camera permission denied")
    );
    assert_eq!(rendered["microphones"][0]["id"], "microphone-1");
    assert_eq!(rendered["systemOutputs"][0]["id"], "output-1");
    assert!(rendered["errors"]["microphones"].is_null());
}

#[test]
fn system_output_failure_does_not_hide_camera_or_microphone() {
    let rendered = catalog(
        Ok(vec![CameraDevice {
            id: "camera-1".into(),
            name: "Camera".into(),
        }]),
        Ok(vec![]),
        Err(AudioError::DeviceUnavailable("output unplugged".into())),
    );
    assert_eq!(rendered["cameras"][0]["id"], "camera-1");
    assert_eq!(rendered["microphones"], serde_json::json!([]));
    assert_eq!(rendered["systemOutputs"], serde_json::json!([]));
    assert!(
        rendered["errors"]["systemOutputs"]
            .as_str()
            .expect("output error")
            .contains("output unplugged")
    );
}
