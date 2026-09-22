#![cfg(test)]

use super::parse_parent_pid;

#[test]
fn owner_pid_parser_rejects_non_numeric_and_overflowing_values() {
    assert_eq!(parse_parent_pid("1234"), Some(1234));
    assert_eq!(parse_parent_pid("invalid"), None);
    assert_eq!(parse_parent_pid("4294967296"), None);
    assert_eq!(parse_parent_pid("-1"), None);
}

#[test]
fn owner_pid_parser_handles_numeric_boundaries_and_exact_text() {
    for (value, expected) in [
        ("0", Some(0)),
        ("1", Some(1)),
        ("+7", Some(7)),
        ("00042", Some(42)),
        ("4294967295", Some(u32::MAX)),
        ("", None),
        (" 7", None),
        ("7 ", None),
        ("1.0", None),
        ("0x10", None),
        ("١", None),
        ("18446744073709551616", None),
    ] {
        assert_eq!(parse_parent_pid(value), expected, "{value:?}");
    }
}

#[test]
fn parent_watch_exposes_stable_public_contract() {
    assert_eq!(super::PARENT_PID_ENV, "BEAM_PARENT_PID");
    assert_eq!(super::FORCED_EXIT_DEADLINE_MS, 3_000);
    assert!(!super::parent_death_requested());
}
