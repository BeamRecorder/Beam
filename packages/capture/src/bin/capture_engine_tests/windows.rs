use std::process::{Command as ProcessCommand, Stdio};
use windows::Win32::{
    System::Threading::GetCurrentProcess,
    UI::HiDpi::{
        AreDpiAwarenessContextsEqual, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
        GetDpiAwarenessContextForProcess, GetThreadDpiAwarenessContext,
    },
};

#[test]
fn capture_engine_sets_process_dpi_awareness_in_an_isolated_process() {
    const CHILD_MARKER: &str = "BEAM_CAPTURE_ENGINE_DPI_TEST_CHILD";

    if std::env::var_os(CHILD_MARKER).is_some() {
        let run_result = super::super::run();
        assert!(
            run_result.is_ok(),
            "capture-engine startup failed: {:?}",
            run_result.err()
        );

        // SAFETY: the current process pseudo-handle is valid and needs no close.
        let process = unsafe { GetCurrentProcess() };
        // SAFETY: querying the current process DPI context requires no extra storage.
        let process_context = unsafe { GetDpiAwarenessContextForProcess(process) };
        // SAFETY: both handles are valid queried/predefined context values.
        assert!(
            unsafe {
                AreDpiAwarenessContextsEqual(
                    process_context,
                    DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
                )
            }
            .as_bool(),
            "capture-engine process must use per-monitor-v2 coordinates"
        );

        let new_thread_is_per_monitor_v2 = std::thread::spawn(|| {
            // SAFETY: reading this thread's current DPI context requires no extra storage.
            let context = unsafe { GetThreadDpiAwarenessContext() };
            // SAFETY: both handles are valid DPI-awareness context values.
            unsafe {
                AreDpiAwarenessContextsEqual(context, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)
            }
            .as_bool()
        })
        .join();
        assert!(
            matches!(new_thread_is_per_monitor_v2, Ok(true)),
            "new capture threads must inherit per-monitor-v2 awareness"
        );
        return;
    }

    let executable = std::env::current_exe();
    assert!(
        executable.is_ok(),
        "failed to resolve the capture-engine test executable: {:?}",
        executable.as_ref().err()
    );
    let Ok(executable) = executable else {
        return;
    };

    let child_result = ProcessCommand::new(executable)
        .args([
            "--exact",
            "tests::windows_dpi::capture_engine_sets_process_dpi_awareness_in_an_isolated_process",
            "--nocapture",
        ])
        .env(CHILD_MARKER, "1")
        .env_remove(capture::parent_watch::PARENT_PID_ENV)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();
    assert!(
        child_result.is_ok(),
        "failed to launch the isolated capture-engine test process: {:?}",
        child_result.as_ref().err()
    );
    let Ok(mut child) = child_result else {
        return;
    };

    // EOF lets run_blocking_protocol finish; the process-global DPI change stays
    // in this subprocess and cannot affect the parallel test harness.
    drop(child.stdin.take());
    let output = child.wait_with_output();
    assert!(
        output.is_ok(),
        "failed to collect the isolated capture-engine test output: {:?}",
        output.as_ref().err()
    );
    let Ok(output) = output else {
        return;
    };
    assert!(
        output.status.success(),
        "isolated capture-engine DPI test failed\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}
