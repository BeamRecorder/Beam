use super::{await_startup, parse_startup, stderr_tail, stop_child};
use std::{fs, process::Command, sync::atomic::AtomicU64, time::Duration};

#[test]
fn startup_accepts_ready_only() {
    assert!(parse_startup(r#"{"ready":true}"#).is_ok());
    assert!(parse_startup(r#"{"ready":false}"#).is_err());
    assert!(parse_startup(r#"{"other":true}"#).is_err());
}

#[test]
fn startup_returns_the_editors_actual_failure() {
    let failure = parse_startup(r#"{"error":"project manifest is invalid"}"#).unwrap_err();
    assert!(failure.contains("project manifest is invalid"));
    assert!(
        parse_startup("")
            .unwrap_err()
            .contains("Invalid editor startup response")
    );
}

#[cfg(unix)]
#[test]
fn startup_waits_for_ready_and_stops_a_failed_child() {
    let directory = tempfile::tempdir().unwrap();
    let marker = directory.path().join("ready.json");
    let mut child = Command::new("sleep").arg("5").spawn().unwrap();
    let diagnostics = stderr_tail(&mut child);
    fs::write(&marker, r#"{"ready":true}"#).unwrap();
    assert!(
        await_startup(
            &mut child,
            &marker,
            &diagnostics,
            &AtomicU64::new(1),
            1,
            Duration::from_secs(1)
        )
        .is_ok()
    );
    stop_child(&mut child);

    let mut failed = Command::new("sleep").arg("5").spawn().unwrap();
    let diagnostics = stderr_tail(&mut failed);
    fs::write(&marker, r#"{"error":"invalid recording"}"#).unwrap();
    assert!(
        await_startup(
            &mut failed,
            &marker,
            &diagnostics,
            &AtomicU64::new(1),
            1,
            Duration::from_secs(1)
        )
        .unwrap_err()
        .contains("invalid recording")
    );
    assert!(failed.try_wait().unwrap().is_some());
}

#[cfg(unix)]
#[test]
fn startup_reports_child_exit_cancellation_and_timeout() {
    let directory = tempfile::tempdir().unwrap();
    let marker = directory.path().join("absent.json");
    let mut exited = Command::new("sh")
        .arg("-c")
        .arg("echo detailed failure >&2; exit 7")
        .stderr(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    let diagnostics = stderr_tail(&mut exited);
    let failure = await_startup(
        &mut exited,
        &marker,
        &diagnostics,
        &AtomicU64::new(1),
        1,
        Duration::from_secs(1),
    )
    .unwrap_err();
    assert!(failure.contains("detailed failure"));

    let mut canceled = Command::new("sleep").arg("5").spawn().unwrap();
    let diagnostics = stderr_tail(&mut canceled);
    assert!(
        await_startup(
            &mut canceled,
            &marker,
            &diagnostics,
            &AtomicU64::new(2),
            1,
            Duration::from_secs(1)
        )
        .unwrap_err()
        .contains("canceled")
    );
    assert!(canceled.try_wait().unwrap().is_some());

    let mut stalled = Command::new("sleep").arg("5").spawn().unwrap();
    let diagnostics = stderr_tail(&mut stalled);
    assert!(
        await_startup(
            &mut stalled,
            &marker,
            &diagnostics,
            &AtomicU64::new(1),
            1,
            Duration::from_millis(1)
        )
        .unwrap_err()
        .contains("60 seconds")
    );
    assert!(stalled.try_wait().unwrap().is_some());
}
