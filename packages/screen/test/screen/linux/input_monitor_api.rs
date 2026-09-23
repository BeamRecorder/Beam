#![cfg(test)]
#![allow(clippy::unwrap_used, clippy::expect_used)]
use super::*;
use std::os::unix::fs::PermissionsExt;

#[test]
fn isolated_input_api_uses_one_broker_and_reports_failed_authorization() {
    const CHILD: &str = "BEAM_TEST_INPUT_API";
    if std::env::var_os(CHILD).is_none() {
        let directory = tempfile::tempdir().unwrap();
        let helper = directory.path().join("helper");
        std::fs::write(&helper, "#!/bin/sh\nexit 0\n").unwrap();
        std::fs::set_permissions(&helper, std::fs::Permissions::from_mode(0o755)).unwrap();
        let pkexec = directory.path().join("pkexec");
        std::fs::write(
            &pkexec,
            "#!/bin/sh\necho 'fake authorization denied' >&2\nexit 1\n",
        )
        .unwrap();
        std::fs::set_permissions(&pkexec, std::fs::Permissions::from_mode(0o755)).unwrap();
        let output = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "screen::linux::input_monitor::api_checks::isolated_input_api_uses_one_broker_and_reports_failed_authorization", "--nocapture"])
            .env(CHILD, "1").env("PATH", directory.path()).env("BEAM_INPUT_HELPER_PATH", helper)
            .output().unwrap();
        assert!(
            output.status.success(),
            "{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        return;
    }
    assert!(input_helper_supported());
    assert!(LinuxInputMonitor::start().unwrap().is_none());
    assert_eq!(
        linux_input_access_status().state,
        crate::input::InputAccessState::InstallationRequired
    );
    let failed = request_linux_input_access().unwrap();
    assert_eq!(failed.state, crate::input::InputAccessState::Unavailable);
    assert_eq!(linux_input_access_status().state, failed.state);
    shutdown_linux_input_access();
    {
        let broker = broker().lock().unwrap();
        broker.shared.ready.store(true, Ordering::Release);
        broker.shared.mouse_devices.store(1, Ordering::Release);
        broker.shared.keyboard_devices.store(2, Ordering::Release);
    }
    let status = request_linux_input_access().unwrap();
    assert_eq!(status.mouse_devices, Some(1));
    assert_eq!(status.keyboard_devices, Some(2));
    assert_eq!(
        linux_input_access_status().state,
        crate::input::InputAccessState::Available
    );
    let mut monitor = LinuxInputMonitor::start().unwrap().unwrap();
    let temporary = tempfile::tempdir().unwrap();
    let request = crate::ScreenRequest {
        selection: crate::model::ScreenSelection::Portal {
            kind: crate::model::PortalSourceKind::Monitor,
            restore_token: None,
        },
        cursor: crate::model::CursorSelection::Separate {
            capture_clicks: true,
            capture_shortcuts: true,
            capture_shape: true,
        },
        region: None,
        fps: 30,
        excluded_window_handles: vec![],
    };
    let mut telemetry = crate::ScreenTelemetry::open(
        temporary.path(),
        &request,
        beam_media_core::SessionClock::start(),
        Arc::new(beam_media_core::StartGate::new()),
    )
    .unwrap()
    .unwrap();
    telemetry.poll(Some(0)).unwrap();
    {
        let broker = broker().lock().unwrap();
        for line in [
            r#"{"event":"mouse-button","monotonicNs":18446744073709551610,"button":1,"pressed":true}"#,
            r#"{"event":"mouse-motion","monotonicNs":18446744073709551611,"deltaX":2,"deltaY":3}"#,
            r#"{"event":"shortcut","monotonicNs":18446744073709551612,"pressed":true,"modifiers":[],"key":"Escape"}"#,
        ] {
            dispatch_input_line(&broker.shared, line);
        }
    }
    assert!(!monitor.drain().is_empty());
    telemetry.poll(Some(1)).unwrap();
    telemetry.poll(None).unwrap();
    telemetry.finish().unwrap();
    assert!(temporary.path().join("input.json").exists());
    monitor.stop();
    shutdown_linux_input_access();
    assert!(LinuxInputMonitor::start().unwrap().is_none());
}

#[test]
fn isolated_input_status_tracks_eof_and_cancelled_authorization() {
    const CHILD: &str = "BEAM_TEST_INPUT_EOF";
    if std::env::var_os(CHILD).is_none() {
        let temporary = tempfile::tempdir().unwrap();
        let executable = temporary.path().join("pkexec");
        std::fs::write(&executable, "#!/bin/sh\nexit 126\n").unwrap();
        std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o755)).unwrap();
        let output = Command::new(std::env::current_exe().unwrap()).args(["--exact", "screen::linux::input_monitor::api_checks::isolated_input_status_tracks_eof_and_cancelled_authorization", "--nocapture"])
            .env(CHILD,"1").env("PATH",temporary.path()).env("BEAM_INPUT_HELPER_PATH", &executable).output().unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        return;
    }
    assert_eq!(
        request_linux_input_access().unwrap().state,
        crate::input::InputAccessState::InstallationRequired
    );
    let mut command = Command::new("/bin/sh");
    command.args(["-c", "printf '%s\\n' '{\"event\":\"ready\",\"mouseDevices\":1}'; echo stopped >&2; exec /bin/sleep 0.05"])
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    {
        let mut broker = broker().lock().unwrap();
        start_broker_with_command(
            &mut broker,
            ElevatedHelperExecutable::installed("/bin/true".into()),
            command,
        )
        .unwrap();
        broker.reader.take().unwrap().join().unwrap();
        broker.child.as_mut().unwrap().wait().unwrap();
    }
    let failure = linux_input_access_status();
    assert_eq!(failure.state, crate::input::InputAccessState::Unavailable);
    assert!(failure.error.unwrap().message.contains("stopped"));
    assert!(linux_input_access_status().error.is_some());
    shutdown_linux_input_access();
}
