#![allow(clippy::expect_used)]

use std::process::Command;

#[test]
fn blocked_periodic_checkpoint_keeps_a_readable_final_manifest() {
    use std::{
        process::Stdio,
        thread,
        time::{Duration, Instant},
    };

    let directory = tempfile::tempdir().expect("tempdir");
    let session_dir = directory.path().join("session");
    let partial = session_dir.join("manifest.partial.json");
    let mut child = Command::new(env!("CARGO_BIN_EXE_beam-media-probe"))
        .args([
            "record",
            "--output",
            session_dir.to_str().expect("path"),
            "--duration",
            "30",
            "--no-camera",
            "--no-microphone",
            "--no-system-audio",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn probe");
    let ready_deadline = Instant::now() + Duration::from_secs(10);
    loop {
        let started = std::fs::read(&partial)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
            .and_then(|manifest| manifest["sessionStartMonotonicNs"].as_u64())
            .is_some_and(|start| start > 0);
        if started {
            break;
        }
        assert!(
            child.try_wait().expect("probe status").is_none() && Instant::now() < ready_deadline,
            "probe did not start"
        );
        thread::sleep(Duration::from_millis(20));
    }
    std::fs::remove_file(&partial).expect("remove periodic checkpoint");
    std::fs::create_dir(&partial).expect("block periodic checkpoint");

    let stop_deadline = Instant::now() + Duration::from_secs(5);
    let status = loop {
        if let Some(status) = child.try_wait().expect("probe status") {
            break status;
        }
        if Instant::now() >= stop_deadline {
            child.kill().expect("kill stalled probe");
            child.wait().expect("reap stalled probe");
            assert!(
                Instant::now() < stop_deadline,
                "probe did not report the failed checkpoint"
            );
        }
        thread::sleep(Duration::from_millis(20));
    };
    assert!(!status.success());
    let manifest: serde_json::Value = serde_json::from_slice(
        &std::fs::read(session_dir.join("manifest.json")).expect("final manifest"),
    )
    .expect("manifest JSON");
    assert_eq!(manifest["completed"], false);
    assert!(
        manifest["warnings"]
            .as_array()
            .expect("warnings")
            .iter()
            .any(|warning| warning
                .as_str()
                .is_some_and(|text| text.contains("session polling failed")))
    );
    assert!(session_dir.join("measurements.json").is_file());
}

#[cfg(target_os = "linux")]
#[test]
fn sigint_finalizes_an_interrupted_manifest() {
    use std::{
        thread,
        time::{Duration, Instant},
    };

    let directory = tempfile::tempdir().expect("tempdir");
    let session_dir = directory.path().join("session");
    let mut child = Command::new(env!("CARGO_BIN_EXE_beam-media-probe"))
        .args([
            "record",
            "--output",
            session_dir.to_str().expect("path"),
            "--duration",
            "30",
            "--no-camera",
            "--no-microphone",
            "--no-system-audio",
        ])
        .spawn()
        .expect("spawn probe");
    let deadline = Instant::now() + Duration::from_secs(10);
    while !session_dir.join("manifest.partial.json").exists() && Instant::now() < deadline {
        assert!(
            child.try_wait().expect("probe status").is_none(),
            "probe exited before recording"
        );
        thread::sleep(Duration::from_millis(20));
    }
    assert!(session_dir.join("manifest.partial.json").exists());
    assert!(
        Command::new("kill")
            .args(["-INT", &child.id().to_string()])
            .status()
            .expect("SIGINT")
            .success()
    );
    let stop_deadline = Instant::now() + Duration::from_secs(5);
    let status = loop {
        if let Some(status) = child.try_wait().expect("probe stop") {
            break status;
        }
        if Instant::now() >= stop_deadline {
            child.kill().expect("kill stalled probe");
            assert!(
                Instant::now() < stop_deadline,
                "probe did not stop after SIGINT"
            );
        }
        thread::sleep(Duration::from_millis(20));
    };
    assert!(!status.success());
    let manifest: serde_json::Value = serde_json::from_slice(
        &std::fs::read(session_dir.join("manifest.json")).expect("final manifest"),
    )
    .expect("manifest JSON");
    assert_eq!(manifest["completed"], false);
    assert!(
        manifest["warnings"]
            .as_array()
            .expect("warnings")
            .iter()
            .any(|warning| warning
                .as_str()
                .is_some_and(|text| text.contains("recording interrupted by user")))
    );
    assert!(session_dir.join("measurements.json").exists());
}
