#![allow(clippy::expect_used)]

use std::process::Command;

#[path = "capture_engine_cli.rs"]
mod engine_cli;
#[path = "capture_probe_cli.rs"]
mod probe_cli;

#[test]
fn smoke_command_requires_an_explicit_mode_before_device_discovery() {
    let result = Command::new(env!("CARGO_BIN_EXE_capture-smoke"))
        .output()
        .expect("smoke binary");
    assert!(!result.status.success());
    assert!(String::from_utf8_lossy(&result.stderr).contains("usage: capture-smoke"));
}

#[cfg(target_os = "linux")]
#[test]
fn smoke_screen_and_cursor_modes_report_readiness_without_opening_devices() {
    for mode in ["screen", "cursor"] {
        let result = Command::new(env!("CARGO_BIN_EXE_capture-smoke"))
            .arg(mode)
            .output()
            .expect("run smoke readiness mode");
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        let value: serde_json::Value = serde_json::from_slice(&result.stdout).expect("JSON report");
        assert_eq!(value["mode"], mode);
        assert_eq!(value["ready"], true);
        assert!(value["sources"].is_u64());
        assert_eq!(
            value["note"],
            "hardware stream opens only after explicit source validation"
        );
    }
}

#[cfg(target_os = "linux")]
#[test]
fn smoke_readiness_echoes_unknown_mode_and_ignores_recording_flags() {
    let result = Command::new(env!("CARGO_BIN_EXE_capture-smoke"))
        .args([
            "unexpected-mode",
            "--duration",
            "nonsense",
            "--output",
            "unused",
        ])
        .output()
        .expect("run readiness mode");
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&result.stdout).expect("JSON report");
    assert_eq!(value["mode"], "unexpected-mode");
    assert_eq!(value["ready"], true);
    assert_eq!(String::from_utf8_lossy(&result.stdout).lines().count(), 1);
}

#[cfg(target_os = "linux")]
#[test]
fn smoke_full_rejects_invalid_duration_before_creating_output() {
    for duration in ["not-a-number", "-1", "18446744073709551616"] {
        let output = tempfile::tempdir().expect("temporary output root");
        let result = Command::new(env!("CARGO_BIN_EXE_capture-smoke"))
            .args(["full", "--duration", duration, "--output"])
            .arg(output.path().join("recording"))
            .output()
            .expect("run full mode");
        assert!(!result.status.success(), "duration {duration}");
        assert!(result.stdout.is_empty());
        assert!(!output.path().join("recording").exists());
        assert!(!result.stderr.is_empty());
    }
}
