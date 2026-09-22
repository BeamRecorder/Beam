#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;

use std::path::PathBuf;

use crate::input::InputAccessState;

fn helper() -> ElevatedHelperExecutable {
    ElevatedHelperExecutable::installed(PathBuf::from("/bin/true"))
}

fn shell(script: &str) -> Command {
    let mut command = Command::new("/bin/sh");
    command
        .arg("-c")
        .arg(script)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    command
}

#[test]
fn fake_helper_ready_counts_are_reported_without_privilege() {
    for (mouse, keyboard, clicks, shortcuts) in [
        (0, 0, false, false),
        (2, 0, true, false),
        (0, 3, false, true),
    ] {
        let script = format!(
            "printf '%s\\n' '{{\"event\":\"ready\",\"mouseDevices\":{mouse},\"keyboardDevices\":{keyboard}}}'"
        );
        let mut broker = LinuxInputBroker::default();
        let status =
            start_broker_with_command(&mut broker, helper(), shell(&script)).expect("ready helper");
        assert_eq!(status.state, InputAccessState::Available);
        assert_eq!(status.mouse_devices, Some(mouse));
        assert_eq!(status.keyboard_devices, Some(keyboard));
        assert_eq!(status.clicks, clicks);
        assert_eq!(status.shortcuts, shortcuts);
        broker.stop();
        assert!(!broker.shared.ready.load(Ordering::Acquire));
        assert!(broker.child.is_none());
        assert!(broker.reader.is_none());
    }
}

#[test]
fn fake_helper_reader_delivers_events_then_releases_subscribers_at_eof() {
    let mut broker = LinuxInputBroker::default();
    let queue = Arc::new(Mutex::new(InputEventQueue::default()));
    broker
        .shared
        .subscribers
        .lock()
        .expect("subscribers")
        .push(Arc::downgrade(&queue));
    let script = concat!(
        "printf '%s\\n' '{\"event\":\"ready\",\"mouseDevices\":1,\"keyboardDevices\":1}' ",
        "'{\"event\":\"mouse-button\",\"monotonicNs\":10,\"button\":1,\"pressed\":true}' ",
        "'not-json' ",
        "'{\"event\":\"mouse-motion\",\"monotonicNs\":11,\"deltaX\":2,\"deltaY\":-3}'"
    );
    let status =
        start_broker_with_command(&mut broker, helper(), shell(script)).expect("ready helper");
    assert_eq!(status.state, InputAccessState::Available);
    broker
        .reader
        .take()
        .expect("reader thread")
        .join()
        .expect("reader exit");
    let events = &queue.lock().expect("queue").events;
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].monotonic_ns(), 10);
    assert_eq!(events[1].monotonic_ns(), 11);
    assert!(!broker.shared.ready.load(Ordering::Acquire));
    assert!(
        broker
            .shared
            .subscribers
            .lock()
            .expect("subscribers")
            .is_empty()
    );
    broker.stop();
}

#[test]
fn fake_helper_restart_replaces_counts_and_reaps_previous_reader() {
    let mut broker = LinuxInputBroker::default();
    let first =
        shell("printf '%s\\n' '{\"event\":\"ready\",\"mouseDevices\":1,\"keyboardDevices\":0}'");
    let initial = start_broker_with_command(&mut broker, helper(), first).expect("first ready");
    assert_eq!(initial.mouse_devices, Some(1));
    broker.stop();
    let second =
        shell("printf '%s\\n' '{\"event\":\"ready\",\"mouseDevices\":0,\"keyboardDevices\":2}'");
    let next = start_broker_with_command(&mut broker, helper(), second).expect("second ready");
    assert_eq!(next.mouse_devices, Some(0));
    assert_eq!(next.keyboard_devices, Some(2));
    broker.stop();
}

#[test]
fn fake_helper_invalid_readiness_preserves_stderr_context_and_cleans_up() {
    for (script, expected) in [
        (
            "printf '%s\\n' 'not-json'; echo diagnostic >&2; exit 7",
            "Invalid input helper readiness JSON",
        ),
        (
            "printf '%s\\n' '{\"event\":\"wrong\"}'; echo diagnostic >&2; exit 7",
            "invalid readiness response",
        ),
        ("echo diagnostic >&2; exit 7", "diagnostic"),
        (
            "printf '\\377\\n'; echo diagnostic >&2; exit 7",
            "readiness failed",
        ),
    ] {
        let mut broker = LinuxInputBroker::default();
        let error = start_broker_with_command(&mut broker, helper(), shell(script))
            .expect_err("bad readiness");
        assert!(error.to_string().contains(expected), "{script}: {error}");
        assert!(broker.child.is_none());
        assert!(broker.reader.is_none());
        assert!(broker.diagnostics.is_none());
        broker.stop();
    }
}

#[test]
fn fake_helper_missing_pipes_and_spawn_error_are_reported() {
    let mut broker = LinuxInputBroker::default();
    let mut no_stderr = shell("exit 0");
    no_stderr.stderr(Stdio::null());
    let error = start_broker_with_command(&mut broker, helper(), no_stderr).expect_err("no stderr");
    assert!(error.to_string().contains("stderr was unavailable"));
    broker.stop();

    let mut no_stdout = shell("echo pipe-diagnostic >&2; exit 0");
    no_stdout.stdout(Stdio::null());
    let error = start_broker_with_command(&mut broker, helper(), no_stdout).expect_err("no stdout");
    assert!(error.to_string().contains("stdout was unavailable"));
    broker.stop();

    let missing = Command::new("/definitely/missing/beam-input-helper");
    let error =
        start_broker_with_command(&mut broker, helper(), missing).expect_err("spawn failure");
    assert!(error.to_string().contains("failed to start"));
    broker.stop();
}
