#![allow(clippy::expect_used)]

use capture::model::{CaptureDiagnostics, LinuxCaptureDiagnostics};

#[test]
fn diagnostics_preserve_linux_details_and_default_missing_distribution_aliases() {
    let json = serde_json::json!({
        "platform": "linux",
        "linux": {
            "architecture": "x86_64",
            "sessionType": "wayland",
            "displayServer": "wayland",
            "backend": "pipewire",
            "portal": {"available": true},
            "pipewire": {"available": true},
            "ffmpeg": {"available": true},
            "recordingAvailable": true
        }
    });
    let diagnostics: CaptureDiagnostics = serde_json::from_value(json).expect("diagnostics");
    let linux: LinuxCaptureDiagnostics = diagnostics.linux.expect("Linux details");
    assert_eq!(linux.session_type, "wayland");
    assert!(linux.distribution_like.is_empty());
    assert!(linux.recording_available);
}
