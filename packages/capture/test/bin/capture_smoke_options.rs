#![cfg(test)]
#![allow(clippy::expect_used)]

use std::path::PathBuf;

use super::parse_full_session_options;

fn parse(arguments: &[&str]) -> Result<(u64, PathBuf), capture::CaptureError> {
    parse_full_session_options(arguments.iter().map(|value| (*value).to_owned()))
}

#[test]
fn full_smoke_defaults_when_flags_are_absent() {
    assert_eq!(
        parse(&[]).expect("defaults"),
        (10, PathBuf::from("capture-smoke-full"))
    );
    assert_eq!(
        parse(&["capture-smoke", "full"]).expect("defaults"),
        (10, PathBuf::from("capture-smoke-full"))
    );
}

#[test]
fn full_smoke_accepts_duration_limits_and_output_in_any_order() {
    for duration in [0, 1, 300, u64::MAX] {
        let value = duration.to_string();
        for arguments in [
            vec!["--duration", &value, "--output", "custom/path"],
            vec!["--output", "custom/path", "--duration", &value],
        ] {
            assert_eq!(
                parse(&arguments).expect("options"),
                (duration, PathBuf::from("custom/path"))
            );
        }
    }
}

#[test]
fn full_smoke_rejects_invalid_duration_without_interpreting_output() {
    for invalid in ["", "-1", "1.5", "none", "18446744073709551616"] {
        let error = parse(&["--output", "ignored", "--duration", invalid]).expect_err("duration");
        assert!(
            matches!(error, capture::CaptureError::Protocol(_)),
            "{invalid:?}: {error}"
        );
    }
}

#[test]
fn full_smoke_uses_first_matching_value_and_defaults_for_missing_values() {
    assert_eq!(
        parse(&["--duration", "2", "--duration", "4"])
            .expect("first duration")
            .0,
        2
    );
    assert_eq!(
        parse(&["--output", "first", "--output", "second"])
            .expect("first output")
            .1,
        PathBuf::from("first")
    );
    assert_eq!(
        parse(&["--duration"]).expect("missing duration defaults").0,
        10
    );
    assert_eq!(
        parse(&["--output"]).expect("missing output defaults").1,
        PathBuf::from("capture-smoke-full")
    );
    assert_eq!(
        parse(&["--output", ""]).expect("empty output is present").1,
        PathBuf::from("")
    );
}
