#![allow(clippy::expect_used)]

use std::process::{Command, Output};

fn run(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_capture-probe"))
        .args(args)
        .output()
        .expect("run capture-probe")
}

#[test]
fn probe_reports_discovery_capabilities_and_permissions_as_json() {
    for args in [
        vec![],
        vec!["discover"],
        vec!["capabilities"],
        vec!["permissions"],
    ] {
        let output = run(&args);
        assert!(
            output.status.success(),
            "{args:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let value: serde_json::Value = serde_json::from_slice(&output.stdout).expect("probe JSON");
        assert!(value.is_object());
        if args.is_empty() || args == ["discover"] {
            assert!(value["sources"].is_array());
            assert!(value["capabilities"].is_object());
            assert!(value["permissions"].is_object());
        }
    }
}

#[test]
fn probe_formats_for_discovered_source_match_catalog_entry_when_available() {
    let discovery = run(&["discover"]);
    assert!(discovery.status.success());
    let snapshot: serde_json::Value =
        serde_json::from_slice(&discovery.stdout).expect("discovery JSON");
    let Some(source) = snapshot["sources"]
        .as_array()
        .and_then(|sources| sources.first())
    else {
        return;
    };
    let id = source["id"].as_str().expect("source id");
    let formats = run(&["formats", "--source", id]);
    assert!(
        formats.status.success(),
        "{}",
        String::from_utf8_lossy(&formats.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&formats.stdout).expect("formats JSON");
    assert_eq!(value, source["capabilities"]["formats"]);
}

#[test]
fn probe_rejects_unknown_command_and_missing_format_arguments_before_discovery() {
    for (args, expected) in [
        (vec!["unknown"], "unknown probe command"),
        (vec!["formats"], "missing argument --source"),
        (vec!["formats", "--source"], "missing value for --source"),
    ] {
        let output = run(&args);
        assert!(!output.status.success(), "{args:?}");
        assert!(
            String::from_utf8_lossy(&output.stderr).contains(expected),
            "{args:?}"
        );
        assert!(output.stdout.is_empty());
    }
}

#[test]
fn probe_reports_unknown_format_source_after_catalog_discovery() {
    let output = run(&["formats", "--source", "missing-source"]);
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("missing-source"));
    assert!(output.stdout.is_empty());
}

#[cfg(target_os = "linux")]
#[test]
fn native_probe_validates_duration_kind_and_queue_before_opening_portal() {
    for (args, expected) in [
        (vec![], "missing argument --duration-seconds"),
        (
            vec!["--duration-seconds"],
            "missing value for --duration-seconds",
        ),
        (vec!["--duration-seconds", "abc"], "invalid digit"),
        (vec!["--duration-seconds", "0"], "between 1 and 300"),
        (vec!["--duration-seconds", "301"], "between 1 and 300"),
        (
            vec!["--duration-seconds", "1", "--kind", "invalid"],
            "unknown Portal source kind",
        ),
        (
            vec!["--duration-seconds", "1", "--queue-capacity", "invalid"],
            "invalid digit",
        ),
        (
            vec!["--duration-seconds", "1", "--queue-capacity", "0"],
            "must be non-zero",
        ),
    ] {
        let mut command = vec!["linux-native-capture"];
        command.extend(args);
        let output = run(&command);
        assert!(!output.status.success(), "{command:?}");
        assert!(
            String::from_utf8_lossy(&output.stderr).contains(expected),
            "{command:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
}
