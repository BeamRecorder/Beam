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
#[cfg(target_os = "linux")]
#[test]
#[allow(clippy::unwrap_used)]
fn isolated_parent_guard_observes_signal_and_forces_a_blocked_owner_to_exit() {
    const MODE: &str = "BEAM_TEST_PARENT_GUARD";
    if let Ok(mode) = std::env::var(MODE) {
        super::install_parent_death_guard().unwrap();
        if mode == "mismatch" {
            assert!(super::parent_death_requested());
            return;
        }
        assert!(!super::parent_death_requested());
        // SAFETY: the guard installed a handler for this signal in this isolated child.
        unsafe {
            libc::raise(libc::SIGTERM);
        }
        assert!(super::parent_death_requested());
        std::thread::sleep(std::time::Duration::from_secs(5));
        std::process::exit(42);
    }
    for (mode, pid, expected) in [
        ("mismatch", "4294967295".to_owned(), 0),
        ("watch", std::process::id().to_string(), 1),
    ] {
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "parent_watch::parent_watch_checks::isolated_parent_guard_observes_signal_and_forces_a_blocked_owner_to_exit", "--nocapture"])
            .env(MODE, mode).env(super::PARENT_PID_ENV, pid).output().unwrap();
        assert_eq!(
            output.status.code(),
            Some(expected),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
}
