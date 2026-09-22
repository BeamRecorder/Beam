#![allow(clippy::expect_used, clippy::panic)]

use std::process::Command;

#[test]
fn missing_output_is_rejected_before_opening_hardware() {
    let result = Command::new(env!("CARGO_BIN_EXE_beam-media-probe"))
        .args(["record", "--duration", "1"])
        .output()
        .expect("record arguments");
    assert!(!result.status.success());
    assert!(String::from_utf8_lossy(&result.stderr).contains("--output"));
}

#[test]
fn all_sources_disabled_still_publishes_an_honest_incomplete_manifest() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let output = temporary.path().join("session");
    let result = Command::new(env!("CARGO_BIN_EXE_beam-media-probe"))
        .args([
            "record",
            "--output",
            output.to_str().expect("path"),
            "--duration",
            "1",
            "--no-camera",
            "--no-microphone",
            "--no-system-audio",
        ])
        .output()
        .expect("record");
    assert!(!result.status.success());
    let manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(output.join("manifest.json")).expect("manifest"))
            .expect("JSON");
    assert_eq!(manifest["completed"], false);
    assert_eq!(manifest["tracks"].as_array().expect("tracks").len(), 0);
    assert!(output.join("measurements.json").is_file());
}

#[test]
fn explicitly_unavailable_audio_sources_leave_failed_tracks_without_fake_files() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let output = temporary.path().join("session");
    let result = Command::new(env!("CARGO_BIN_EXE_beam-media-probe"))
        .args([
            "record",
            "--output",
            output.to_str().expect("path"),
            "--duration",
            "1",
            "--no-camera",
            "--microphone",
            "beam-no-such-microphone",
            "--system-output",
            "beam-no-such-output",
        ])
        .output()
        .expect("record");
    assert!(!result.status.success());
    let manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(output.join("manifest.json")).expect("manifest"))
            .expect("JSON");
    assert_eq!(manifest["completed"], false);
    let tracks = manifest["tracks"].as_array().expect("tracks");
    assert_eq!(tracks.len(), 2);
    for track in tracks {
        assert_eq!(track["status"], "failed");
        assert!(track["segments"].as_array().expect("segments").is_empty());
        assert!(track["terminationReason"].as_str().is_some());
    }
    assert!(!output.join("microphone.wav").exists());
    assert!(!output.join("system-audio.wav").exists());
}

#[test]
fn impossible_duration_interrupts_and_saves_the_session() {
    use std::{
        thread,
        time::{Duration, Instant},
    };

    let temporary = tempfile::tempdir().expect("tempdir");
    let output = temporary.path().join("session");
    let mut child = Command::new(env!("CARGO_BIN_EXE_beam-media-probe"))
        .args([
            "record",
            "--output",
            output.to_str().expect("path"),
            "--duration",
            "18446744073709551615",
            "--no-camera",
            "--no-microphone",
            "--no-system-audio",
        ])
        .spawn()
        .expect("record");
    let deadline = Instant::now() + Duration::from_secs(5);
    let status = loop {
        if let Some(status) = child.try_wait().expect("record status") {
            break status;
        }
        if Instant::now() >= deadline {
            child.kill().expect("stop stalled record");
            panic!("impossible recording duration did not fail promptly");
        }
        thread::sleep(Duration::from_millis(10));
    };
    assert!(!status.success());
    let manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(output.join("manifest.json")).expect("manifest"))
            .expect("JSON");
    assert_eq!(manifest["completed"], false);
    assert!(output.join("measurements.json").is_file());
}

#[cfg(target_os = "linux")]
#[test]
fn explicitly_missing_camera_is_reported_without_a_fake_video() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let output = temporary.path().join("session");
    let result = Command::new(env!("CARGO_BIN_EXE_beam-media-probe"))
        .args([
            "record",
            "--output",
            output.to_str().expect("path"),
            "--duration",
            "1",
            "--camera",
            "/dev/beam-no-such-camera",
            "--no-microphone",
            "--no-system-audio",
        ])
        .output()
        .expect("record");
    assert!(!result.status.success());
    let manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(output.join("manifest.json")).expect("manifest"))
            .expect("JSON");
    assert_eq!(manifest["completed"], false);
    assert_eq!(manifest["tracks"][0]["kind"], "camera");
    assert_eq!(manifest["tracks"][0]["status"], "failed");
    assert!(
        manifest["tracks"][0]["segments"]
            .as_array()
            .expect("segments")
            .is_empty()
    );
    assert!(!output.join("camera.webm").exists());
}
