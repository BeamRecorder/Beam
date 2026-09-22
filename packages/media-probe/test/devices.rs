#![allow(clippy::expect_used)]

use std::process::Command;

#[test]
#[ignore = "requires local camera and audio device discovery"]
fn device_catalog_has_the_shared_camera_and_audio_sections() {
    let result = Command::new(env!("CARGO_BIN_EXE_beam-media-probe"))
        .arg("devices")
        .output()
        .expect("device catalog");
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let catalog: serde_json::Value = serde_json::from_slice(&result.stdout).expect("catalog JSON");
    for section in ["cameras", "microphones", "systemOutputs"] {
        assert!(catalog[section].is_array(), "missing {section}");
    }
}
