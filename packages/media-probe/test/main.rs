#![allow(clippy::expect_used)]

use std::process::Command;

#[test]
fn top_level_help_lists_commands_and_rejects_trailing_arguments() {
    let binary = env!("CARGO_BIN_EXE_beam-media-probe");
    let help = Command::new(binary).arg("--help").output().expect("help");
    assert!(help.status.success());
    let text = String::from_utf8(help.stdout).expect("UTF-8");
    for command in ["devices", "record", "report"] {
        assert!(text.contains(command));
    }
    let trailing = Command::new(binary)
        .args(["--help", "--unexpected"])
        .output()
        .expect("trailing argument");
    assert!(!trailing.status.success());
    assert!(String::from_utf8_lossy(&trailing.stderr).contains("unexpected argument"));
}

#[test]
fn invalid_devices_arguments_fail_before_device_discovery() {
    let output = Command::new(env!("CARGO_BIN_EXE_beam-media-probe"))
        .args(["devices", "--unexpected"])
        .output()
        .expect("devices arguments");
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("unexpected argument"));
}
