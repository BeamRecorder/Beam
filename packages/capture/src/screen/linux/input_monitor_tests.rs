#![allow(clippy::expect_used)]

use super::input_monitor::parse_helper_version;

#[test]
fn parses_current_helper_version_and_policy_revision() {
    let output = format!(
        r#"{{"version":"{}","policyVersion":2}}"#,
        env!("CARGO_PKG_VERSION")
    );

    assert_eq!(
        parse_helper_version(output.as_bytes()),
        Some((env!("CARGO_PKG_VERSION").to_owned(), 2))
    );
}

#[test]
fn rejects_helper_version_without_policy_revision() {
    assert_eq!(
        parse_helper_version(
            format!(r#"{{"version":"{}"}}"#, env!("CARGO_PKG_VERSION")).as_bytes()
        ),
        None
    );
}

#[test]
fn rejects_helper_version_with_incorrect_metadata_types() {
    assert_eq!(
        parse_helper_version(br#"{"version":"0.1.0","policyVersion":"2"}"#),
        None
    );
    assert_eq!(
        parse_helper_version(br#"{"version":1,"policyVersion":2}"#),
        None
    );
}

#[test]
fn rejects_invalid_helper_version_json() {
    assert_eq!(parse_helper_version(b"not json"), None);
}

#[test]
fn policy_revision_change_is_detected_even_when_package_version_matches() {
    let current = parse_helper_version(
        format!(
            r#"{{"version":"{}","policyVersion":2}}"#,
            env!("CARGO_PKG_VERSION")
        )
        .as_bytes(),
    )
    .expect("current helper metadata");
    let previous = parse_helper_version(
        format!(
            r#"{{"version":"{}","policyVersion":1}}"#,
            env!("CARGO_PKG_VERSION")
        )
        .as_bytes(),
    )
    .expect("previous helper metadata");

    assert_ne!(current, previous);
}
