#![cfg(test)]
#![allow(clippy::expect_used, clippy::panic)]

use super::*;
use std::{
    fs::{self, File},
    path::PathBuf,
    process::{Child, Command as ProcessCommand, Stdio},
    time::{Duration, Instant},
};

struct IsolatedPipewire {
    _root: tempfile::TempDir,
    runtime: PathBuf,
    xdg_config: PathBuf,
    log: PathBuf,
    process: Child,
}

impl IsolatedPipewire {
    fn start(with_sink: bool) -> Self {
        let root = tempfile::tempdir().expect("temporary PipeWire root");
        let runtime = root.path().join("runtime");
        let xdg_config = root.path().join("config");
        fs::create_dir_all(&runtime).expect("runtime directory");
        fs::create_dir_all(&xdg_config).expect("XDG config directory");
        if with_sink {
            let drop_in = xdg_config.join("pipewire/pipewire.conf.d");
            fs::create_dir_all(&drop_in).expect("PipeWire config drop-in");
            fs::write(
                drop_in.join("beam-test.conf"),
                r#"context.objects = [
    { factory = adapter args = {
        factory.name = support.null-audio-sink
        node.name = beam-test-sink
        node.description = "Beam Test Sink"
        media.class = "Audio/Sink"
        audio.position = "FL,FR"
        monitor.passthrough = true
    } }
]"#,
            )
            .expect("write virtual sink config");
        }
        let log = root.path().join("pipewire.log");
        let stderr = File::create(&log).expect("PipeWire log");
        let process = ProcessCommand::new("pipewire")
            .env("PIPEWIRE_RUNTIME_DIR", &runtime)
            .env("PIPEWIRE_CORE", "beam-test")
            .env("PIPEWIRE_REMOTE", "beam-test")
            .env("DISABLE_RTKIT", "1")
            .env("XDG_CONFIG_HOME", &xdg_config)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::from(stderr))
            .spawn()
            .expect("start isolated PipeWire daemon");
        let mut server = Self {
            _root: root,
            runtime,
            xdg_config,
            log,
            process,
        };
        let deadline = Instant::now() + Duration::from_secs(2);
        while !server.runtime.join("beam-test").exists() {
            if let Some(status) = server.process.try_wait().expect("query PipeWire daemon") {
                panic!("PipeWire daemon exited {status}: {}", server.diagnostics());
            }
            assert!(
                Instant::now() < deadline,
                "PipeWire socket did not appear: {}",
                server.diagnostics()
            );
            std::thread::sleep(Duration::from_millis(10));
        }
        server
    }

    fn diagnostics(&self) -> String {
        fs::read_to_string(&self.log).unwrap_or_default()
    }

    fn apply_environment(&self, command: &mut ProcessCommand) {
        command
            .env("PIPEWIRE_RUNTIME_DIR", &self.runtime)
            .env("PIPEWIRE_CORE", "beam-test")
            .env("PIPEWIRE_REMOTE", "beam-test")
            .env("DISABLE_RTKIT", "1")
            .env("XDG_CONFIG_HOME", &self.xdg_config);
    }
}

impl Drop for IsolatedPipewire {
    fn drop(&mut self) {
        let _ = self.process.kill();
        let _ = self.process.wait();
    }
}

fn run_worker_child(with_sink: bool) {
    let (commands, receiver) = pw::channel::channel();
    let (sink, _sink_receiver) = crossbeam_channel::bounded(4);
    let (ready, ready_receiver) = mpsc::sync_channel(1);
    let fatal = Arc::new(Mutex::new(None));
    let metrics = Arc::new(SystemAudioMetrics::default());
    let gate = Arc::new(StartGate::new());
    gate.release(0).expect("release start gate");
    let stopper = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(220));
        assert!(
            commands.send(Command::Stop).is_ok(),
            "send stop to PipeWire mainloop"
        );
    });
    pipewire_worker(
        receiver,
        sink,
        fatal.clone(),
        metrics,
        gate,
        with_sink,
        ready,
    )
    .expect("worker connects and stops against isolated PipeWire");
    stopper.join().expect("stopper exits");
    if let Ok(result) = ready_receiver.try_recv() {
        let format = result.expect("negotiated format");
        assert!(format.sample_rate > 0);
        assert!(format.channels > 0);
    }
    assert!(fatal.lock().expect("fatal state").is_none());
}

#[test]
fn daemon_worker_child_entry() {
    let Ok(mode) = std::env::var("BEAM_PW_TEST_CHILD") else {
        return;
    };
    assert!(matches!(mode.as_str(), "bare" | "sink"));
    run_worker_child(mode == "sink");
}

fn run_in_child(server: &IsolatedPipewire, mode: &str) {
    let executable = std::env::current_exe().expect("current test executable");
    let mut command = ProcessCommand::new(executable);
    command
        .arg("daemon_worker_child_entry")
        .arg("--nocapture")
        .env("BEAM_PW_TEST_CHILD", mode)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    server.apply_environment(&mut command);
    let mut child = command.spawn().expect("worker subprocess");
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        if child.try_wait().expect("query worker child").is_some() {
            break;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let output = child.wait_with_output().expect("reap timed out worker");
            panic!(
                "worker child timed out ({mode}); stdout={} stderr={} daemon={}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr),
                server.diagnostics()
            );
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let output = child.wait_with_output().expect("reap worker child");
    assert!(
        output.status.success(),
        "worker child failed ({mode}); stdout={} stderr={} daemon={}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
        server.diagnostics()
    );
}

#[test]
fn worker_connects_to_isolated_pipewire_without_a_sink() {
    let server = IsolatedPipewire::start(false);
    run_in_child(&server, "bare");
}

#[test]
fn worker_connects_to_isolated_pipewire_with_virtual_sink() {
    let server = IsolatedPipewire::start(true);
    run_in_child(&server, "sink");
}
