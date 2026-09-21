#![allow(clippy::expect_used)]

use std::{
    io::{BufRead, BufReader},
    process::{Child, ChildStdout, Command, Stdio},
    time::{Duration, Instant},
};

use super::super::{input_helper_diagnostics::HelperDiagnostics, owned_child};
use super::{LinuxInputBroker, failed_startup};

fn helper(script: &str) -> (Child, BufReader<ChildStdout>, LinuxInputBroker) {
    let mut command = Command::new("/bin/sh");
    command
        .arg("-c")
        .arg(script)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    owned_child::configure(&mut command);
    let mut child = command.spawn().expect("spawn local helper fixture");
    owned_child::register(&child);
    let diagnostics = HelperDiagnostics::start(child.stderr.take().expect("piped stderr"))
        .expect("start stderr diagnostics");
    let stdout = BufReader::new(child.stdout.take().expect("piped stdout"));
    let broker = LinuxInputBroker {
        diagnostics: Some(diagnostics),
        ..LinuxInputBroker::default()
    };
    (child, stdout, broker)
}

#[test]
fn closed_stdout_terminates_a_still_running_helper_and_keeps_stderr() {
    let (mut child, mut stdout, mut broker) =
        helper("printf 'helper stderr detail\\n' >&2; exec 1>&-; exec sleep 5");
    let mut line = String::new();
    assert_eq!(stdout.read_line(&mut line).expect("read stdout EOF"), 0);

    let started = Instant::now();
    let error = failed_startup(&mut broker, &mut child, "");

    assert!(started.elapsed() < Duration::from_secs(2));
    assert!(
        error.to_string().contains("helper stderr detail"),
        "{error}"
    );
    assert!(broker.diagnostics.is_none());
}

#[test]
fn already_exited_126_remains_a_cancellation() {
    let (mut child, mut stdout, mut broker) = helper("exit 126");
    assert_eq!(
        child.wait().expect("wait for canceled helper").code(),
        Some(126)
    );
    let mut line = String::new();
    assert_eq!(stdout.read_line(&mut line).expect("read stdout EOF"), 0);

    let error = failed_startup(&mut broker, &mut child, "");

    assert!(matches!(error, crate::CaptureError::Cancelled));
    assert!(broker.diagnostics.is_none());
}

#[test]
fn malformed_readiness_error_includes_context_and_drained_stderr() {
    let (mut child, mut stdout, mut broker) =
        helper("printf 'helper stderr detail\\n' >&2; printf 'not-json\\n'; exec sleep 30");
    let mut line = String::new();
    assert!(stdout.read_line(&mut line).expect("read readiness line") > 0);

    let error = failed_startup(
        &mut broker,
        &mut child,
        "Invalid input helper readiness JSON: expected a JSON value.",
    );

    let message = error.to_string();
    assert!(message.contains("Invalid input helper readiness JSON"));
    assert!(message.contains("helper stderr detail"));
    assert!(broker.diagnostics.is_none());
}
