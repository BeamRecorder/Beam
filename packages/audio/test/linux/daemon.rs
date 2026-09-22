#![cfg(test)]
#![allow(clippy::expect_used, clippy::panic)]

use std::{
    fs,
    path::Path,
    process::{Child, Command as ProcessCommand, Output, Stdio},
    sync::{Arc, atomic::AtomicUsize},
    thread,
    time::{Duration, Instant},
};

use super::*;
use beam_media_core::MonotonicClock;

const CHILD_FLAG: &str = "BEAM_PW_TEST_CHILD";
const TEST_SINK: &str = "beam-test-sink";

struct ProcessGuard(Option<Child>);

impl ProcessGuard {
    fn new(child: Child) -> Self {
        Self(Some(child))
    }

    fn child(&mut self) -> &mut Child {
        self.0.as_mut().expect("live child")
    }

    fn finish(mut self) -> Output {
        self.0
            .take()
            .expect("live child")
            .wait_with_output()
            .expect("wait for child")
    }

    fn kill_and_collect(mut self) -> Output {
        let mut child = self.0.take().expect("live child");
        let _ = child.kill();
        child.wait_with_output().expect("reap child")
    }
}

impl Drop for ProcessGuard {
    fn drop(&mut self) {
        if let Some(mut child) = self.0.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn private_pipewire_configuration(root: &Path, core_name: &str) -> std::path::PathBuf {
    let config_root = root.join("config");
    let drop_in = config_root.join("pipewire/pipewire.conf.d");
    fs::create_dir_all(&drop_in).expect("private PipeWire configuration directory");
    fs::write(
        drop_in.join("99-beam-test.conf"),
        format!(
            r#"
context.properties = {{ core.name = "{core_name}" }}
context.objects = [
    {{ factory = adapter
       args = {{
           factory.name = support.null-audio-sink
           node.name = "{TEST_SINK}"
           node.description = "Beam isolated test output"
           media.class = "Audio/Sink"
           audio.position = "FL,FR"
       }}
    }}
]
"#
        ),
    )
    .expect("write isolated null sink configuration");
    config_root
}

fn wait_for_socket(daemon: &mut ProcessGuard, socket: &Path) {
    let deadline = Instant::now() + Duration::from_secs(2);
    while Instant::now() < deadline {
        if socket.exists() {
            return;
        }
        if daemon
            .child()
            .try_wait()
            .expect("poll PipeWire daemon")
            .is_some()
        {
            let output = std::mem::replace(daemon, ProcessGuard(None)).finish();
            panic!(
                "isolated PipeWire exited before socket creation: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
        thread::sleep(Duration::from_millis(10));
    }
    panic!(
        "isolated PipeWire did not create socket {} within 2 seconds",
        socket.display()
    );
}

fn wait_for_child(child: &mut ProcessGuard) -> Option<Output> {
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        if child.child().try_wait().expect("poll test child").is_some() {
            return Some(std::mem::replace(child, ProcessGuard(None)).finish());
        }
        thread::sleep(Duration::from_millis(10));
    }
    None
}

fn run_isolated_test(mode: &str, test_filter: &str) {
    let root = tempfile::tempdir().expect("private PipeWire test root");
    let runtime = root.path().join("runtime");
    fs::create_dir(&runtime).expect("private PipeWire runtime directory");
    let core_name = format!("beam-audio-{}-{mode}", std::process::id());
    let config_root = private_pipewire_configuration(root.path(), &core_name);
    let daemon = ProcessCommand::new("pipewire")
        .arg("-P")
        .arg(format!("core.name={core_name}"))
        .env("PIPEWIRE_RUNTIME_DIR", &runtime)
        .env("XDG_RUNTIME_DIR", &runtime)
        .env("XDG_CONFIG_HOME", &config_root)
        .env("PIPEWIRE_CORE", &core_name)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("start isolated PipeWire daemon");
    let mut daemon = ProcessGuard::new(daemon);
    wait_for_socket(&mut daemon, &runtime.join(&core_name));

    let test_child =
        ProcessCommand::new(std::env::current_exe().expect("current Rust test binary"))
            .arg(test_filter)
            .arg("--nocapture")
            .env(CHILD_FLAG, mode)
            .env("PIPEWIRE_RUNTIME_DIR", &runtime)
            .env("XDG_RUNTIME_DIR", &runtime)
            .env("XDG_CONFIG_HOME", &config_root)
            .env("PIPEWIRE_CORE", &core_name)
            .env("PIPEWIRE_REMOTE", &core_name)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("start isolated test child");
    let mut test_child = ProcessGuard::new(test_child);
    let output = wait_for_child(&mut test_child);
    let output = output.unwrap_or_else(|| test_child.kill_and_collect());
    let daemon_output = daemon.kill_and_collect();
    assert!(
        output.status.success(),
        "isolated {mode} capture failed or exceeded 3 seconds; child stderr: {}; child stdout: {}; daemon stderr: {}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&daemon_output.stderr),
    );
    assert!(
        String::from_utf8_lossy(&output.stdout).contains("running 1 test"),
        "test child did not run the selected case: {}",
        String::from_utf8_lossy(&output.stdout)
    );
}

fn exercise_pipewire_worker(target: Option<&str>) {
    let (command_tx, command_rx) = pw::channel::channel();
    let (packet_tx, packets) = crossbeam_channel::bounded(4);
    let (event_tx, events) = crossbeam_channel::bounded(8);
    let (terminal_tx, terminal_events) = crossbeam_channel::bounded(1);
    let (ready_tx, ready_rx) = mpsc::sync_channel(1);
    let clock = SessionClock::start();
    let gate = Arc::new(StartGate::new());
    gate.release(clock.now_ns()).expect("release audio gate");
    let command_thread = thread::spawn(move || {
        thread::sleep(Duration::from_millis(100));
        let _ = command_tx.send(Command::Start);
        thread::sleep(Duration::from_millis(150));
        let _ = command_tx.send(Command::Stop);
    });
    let result = run_pipewire(
        command_rx,
        packet_tx,
        event_tx,
        terminal_tx,
        Arc::new(AtomicUsize::new(0)),
        target.map(str::to_owned),
        clock,
        gate,
        16_384,
        ready_tx,
    );
    command_thread.join().expect("command thread");
    assert!(result.is_ok(), "PipeWire stream setup failed: {result:?}");
    if let Ok(Ok(format)) = ready_rx.try_recv() {
        assert!(format.sample_rate > 0);
        assert!(format.channels > 0);
    }
    assert!(packets.len() <= 4);
    assert!(events.len() <= 8);
    assert!(terminal_events.len() <= 1);
}

#[test]
fn isolated_default_output_stream_connects_and_stops() {
    if std::env::var(CHILD_FLAG).as_deref() == Ok("default") {
        exercise_pipewire_worker(None);
    } else {
        run_isolated_test(
            "default",
            "daemon_checks::isolated_default_output_stream_connects_and_stops",
        );
    }
}

#[test]
fn isolated_named_sink_stream_connects_watches_and_stops() {
    if std::env::var(CHILD_FLAG).as_deref() == Ok("named") {
        exercise_pipewire_worker(Some(TEST_SINK));
    } else {
        run_isolated_test(
            "named",
            "daemon_checks::isolated_named_sink_stream_connects_watches_and_stops",
        );
    }
}
