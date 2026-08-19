#![cfg(target_os = "linux")]
#![allow(clippy::expect_used)]

use std::{fs, process::Command};

fn policy_asset() -> String {
    fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/src/bin/beam-input-helper.policy"
    ))
    .expect("Beam input helper policy asset")
}

fn action_blocks(policy: &str) -> impl Iterator<Item = &str> {
    policy
        .split("<action ")
        .skip(1)
        .filter_map(|action| action.split_once("</action>").map(|(block, _)| block))
}

fn annotation<'a>(policy: &'a str, key: &str) -> Option<&'a str> {
    let marker = format!("key=\"{key}\">");
    policy
        .split_once(&marker)?
        .1
        .split_once("</annotate>")
        .map(|(value, _)| value)
}

#[test]
fn helper_version_command_reports_the_current_policy_revision() {
    let output = Command::new(env!("CARGO_BIN_EXE_beam-input-helper"))
        .arg("version")
        .output()
        .expect("run beam-input-helper version");
    assert!(output.status.success());

    let value: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("parse helper version JSON");
    assert_eq!(
        value.get("version").and_then(serde_json::Value::as_str),
        Some(env!("CARGO_PKG_VERSION"))
    );
    assert_eq!(
        value
            .get("policyVersion")
            .and_then(serde_json::Value::as_u64),
        Some(5)
    );
    let policy = policy_asset();
    let policy_version = value
        .get("policyVersion")
        .and_then(serde_json::Value::as_u64)
        .expect("numeric helper policy version");
    assert_eq!(
        annotation(&policy, "com.beam.policy-version").and_then(|version| version.parse().ok()),
        Some(policy_version)
    );
}

#[test]
fn policy_allows_only_the_installed_stream_in_active_sessions() {
    let policy = policy_asset();
    assert!(policy.contains("<allow_any>no</allow_any>"));
    assert!(policy.contains("<allow_inactive>no</allow_inactive>"));
    assert!(policy.contains("<allow_active>yes</allow_active>"));
    assert!(policy.contains(
        "<annotate key=\"org.freedesktop.policykit.exec.path\">/usr/libexec/beam-input-helper</annotate>"
    ));
    assert!(
        policy.contains("<annotate key=\"org.freedesktop.policykit.exec.argv1\">stream</annotate>")
    );

    let blocks: Vec<&str> = action_blocks(&policy).collect();
    assert_eq!(blocks.len(), 1);
    assert!(
        blocks
            .iter()
            .all(|block| block.contains("argv1\">stream</annotate>"))
    );
}

#[test]
fn install_update_and_uninstall_have_no_automatic_authorization() {
    let policy = policy_asset();
    let blocks: Vec<&str> = action_blocks(&policy).collect();
    assert_eq!(blocks.len(), 1);
    assert!(blocks[0].contains("<allow_active>yes</allow_active>"));
    assert!(blocks[0].contains("argv1\">stream</annotate>"));
    assert!(!policy.contains("argv1\">install</annotate>"));
    assert!(!policy.contains("argv1\">install-stream</annotate>"));
    assert!(!policy.contains("argv1\">uninstall</annotate>"));
}
