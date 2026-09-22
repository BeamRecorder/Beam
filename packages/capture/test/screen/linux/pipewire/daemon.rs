#![cfg(test)]
#![allow(clippy::expect_used, clippy::panic)]

use std::{
    fs,
    os::unix::net::UnixStream,
    path::Path,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex, mpsc},
    thread,
    time::{Duration, Instant},
};

use crate::{screen::ScreenCaptureMetrics, session::StartGate};

use super::*;

const CHILD_ENV: &str = "BEAM_CAPTURE_PIPEWIRE_DAEMON_CHILD";
const CHILD_TEST: &str = "screen::linux::pipewire::thread::daemon_checks::daemon_child_entry";

struct Daemon(Child);

impl Drop for Daemon {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn wait_for_socket(socket: &Path, daemon: &mut Child) {
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        if socket.exists() && UnixStream::connect(socket).is_ok() {
            return;
        }
        assert!(
            daemon.try_wait().expect("daemon status").is_none(),
            "PipeWire daemon exited before socket"
        );
        assert!(
            Instant::now() < deadline,
            "PipeWire daemon did not create socket"
        );
        thread::sleep(Duration::from_millis(10));
    }
}

fn run_child(runtime: &Path, node_id: u32) -> std::process::Output {
    let child = Command::new(std::env::current_exe().expect("current test binary"))
        .args(["--exact", CHILD_TEST, "--nocapture"])
        .env(CHILD_ENV, node_id.to_string())
        .env("PIPEWIRE_RUNTIME_DIR", runtime)
        .env("XDG_RUNTIME_DIR", runtime)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn isolated PipeWire client test");
    let mut child = child;
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        if child.try_wait().expect("client status").is_some() {
            return child.wait_with_output().expect("client output");
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let output = child.wait_with_output().expect("timed out client output");
            panic!(
                "PipeWire client exceeded 3 s: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
        thread::sleep(Duration::from_millis(10));
    }
}

#[test]
fn isolated_daemon_exercises_worker_connect_and_stop_without_portal() {
    if std::env::var_os(CHILD_ENV).is_some() {
        return;
    }
    let runtime = tempfile::tempdir().expect("isolated PipeWire runtime");
    let config = runtime.path().join("pipewire.conf");
    fs::copy("/usr/share/pipewire/pipewire.conf", &config).expect("copy PipeWire test config");
    let daemon = Command::new("pipewire")
        .args(["-c", config.to_str().expect("config path")])
        .env("PIPEWIRE_RUNTIME_DIR", runtime.path())
        .env("XDG_RUNTIME_DIR", runtime.path())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn isolated PipeWire daemon");
    let mut daemon = Daemon(daemon);
    let socket = runtime.path().join("pipewire-0");
    wait_for_socket(&socket, &mut daemon.0);
    let output = run_child(runtime.path(), u32::MAX);
    assert!(
        output.status.success(),
        "isolated client failed:\nstdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn daemon_child_entry() {
    let Some(node_id) = std::env::var(CHILD_ENV).ok() else {
        return;
    };
    let node_id = node_id.parse().expect("node ID");
    let runtime = std::env::var_os("PIPEWIRE_RUNTIME_DIR").expect("isolated runtime");
    let socket = Path::new(&runtime).join("pipewire-0");
    let connection = UnixStream::connect(&socket).expect("connect isolated socket");
    let (commands, receiver) = pw::channel::channel();
    let (sink, sink_received) = crossbeam_channel::bounded(8);
    let (cursor_sink, cursor_received) = crossbeam_channel::bounded(8);
    let (ready, ready_received) = mpsc::sync_channel(1);
    let fatal = Arc::new(Mutex::new(None));
    let worker = thread::spawn(move || {
        pipewire_worker(PipewireWorkerConfig {
            remote_fd: connection.into(),
            node_id,
            stream_scope: "isolated-test".into(),
            commands: receiver,
            sink,
            cursor_sink,
            fatal,
            metrics: Arc::new(ScreenCaptureMetrics::default()),
            start_ns: 17,
            start_gate: Arc::new(StartGate::new()),
            ready,
            repair_window_crop: false,
            region: None,
        })
    });
    thread::sleep(Duration::from_millis(200));
    let _ = commands.send(PipewireCommand::Stop);
    let result = worker.join().expect("worker did not panic");
    eprintln!(
        "worker result: {result:?}, ready: {:?}",
        ready_received.try_recv()
    );
    drop(commands);
    assert!(sink_received.try_recv().is_err());
    assert!(cursor_received.try_recv().is_err());
    result.expect("PipeWire worker connects and stops");
}
