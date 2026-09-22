#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;
use std::time::Instant;

#[derive(Clone, Copy)]
enum Reply {
    Ok,
    Error,
    Closed,
}

fn lifecycle_worker(
    commands: pw::channel::Receiver<Command>,
    ready: mpsc::SyncSender<Result<SystemAudioFormat, CaptureError>>,
    start: Reply,
    pause: Reply,
    seen: Arc<Mutex<Vec<&'static str>>>,
) -> Result<(), CaptureError> {
    pw::init();
    let mainloop = pw::main_loop::MainLoopRc::new(None).map_err(pipewire_error)?;
    let stop_loop = mainloop.clone();
    let attached = commands.attach(mainloop.loop_(), move |command| match command {
        Command::Start { gate, reply } => {
            seen.lock().expect("command log").push("start");
            match start {
                Reply::Ok => {
                    let _ = reply.send(Ok(()));
                }
                Reply::Error => {
                    let reason = if gate.is_released() {
                        "fixture start failed"
                    } else {
                        "gate not released"
                    };
                    let _ = reply.send(Err(pipewire_error(reason)));
                }
                Reply::Closed => drop(reply),
            }
        }
        Command::Pause { reply } => {
            seen.lock().expect("command log").push("pause");
            match pause {
                Reply::Ok => {
                    let _ = reply.send(Ok(()));
                }
                Reply::Error => {
                    let _ = reply.send(Err(pipewire_error("fixture pause failed")));
                }
                Reply::Closed => drop(reply),
            }
        }
        Command::Stop => {
            seen.lock().expect("command log").push("stop");
            stop_loop.quit();
        }
    });
    ready
        .send(Ok(format()))
        .map_err(|error| pipewire_error(error.to_string()))?;
    mainloop.run();
    drop(attached);
    Ok(())
}

fn opened(
    initial: Option<SystemAudioSegment>,
    start_gate: Arc<StartGate>,
    start: Reply,
    pause: Reply,
    seen: Arc<Mutex<Vec<&'static str>>>,
) -> PipewireSystemAudioRecording {
    PipewireSystemAudioRecording::open_inner_with_worker(
        SystemAudioSelection::DefaultOutput,
        initial,
        start_gate,
        4,
        move |commands, _, _, _, _, _, ready| lifecycle_worker(commands, ready, start, pause, seen),
    )
    .expect("open system audio recording")
}

fn seen(seen: &Arc<Mutex<Vec<&'static str>>>) -> Vec<&'static str> {
    seen.lock().expect("command log").clone()
}

#[test]
fn start_replies_set_running_only_after_success_and_stop_remains_idempotent() {
    for reply in [Reply::Ok, Reply::Error, Reply::Closed] {
        let log = Arc::new(Mutex::new(Vec::new()));
        let mut recording = opened(None, gate(), reply, Reply::Ok, log.clone());
        let result = recording.start();
        match reply {
            Reply::Ok => assert!(result.is_ok()),
            Reply::Error => assert!(
                result
                    .expect_err("start failed")
                    .to_string()
                    .contains("fixture start failed")
            ),
            Reply::Closed => assert!(
                result
                    .expect_err("start reply closed")
                    .to_string()
                    .contains("lifecycle command timed out")
            ),
        }
        assert_eq!(recording.running, matches!(reply, Reply::Ok));
        recording.stop().expect("stop");
        assert!(!recording.running);
        recording.stop().expect("repeated stop");
        assert_eq!(seen(&log), ["start", "stop"]);
    }
}

#[test]
fn unreleased_gate_is_forwarded_and_worker_rejection_does_not_set_running() {
    let log = Arc::new(Mutex::new(Vec::new()));
    let unreleased = Arc::new(StartGate::new());
    let mut recording = opened(None, unreleased, Reply::Error, Reply::Ok, log.clone());
    let error = recording
        .start()
        .expect_err("fake worker rejects unreleased gate");
    assert!(error.to_string().contains("gate not released"));
    assert!(!recording.running);
    recording.stop().expect("stop");
    assert_eq!(seen(&log), ["start", "stop"]);
}

#[test]
fn pause_before_start_is_inert_and_successful_pause_finalizes_current_segment() {
    let output = tempfile::tempdir().expect("temporary output");
    let path = output.path().join("first.wav");
    let log = Arc::new(Mutex::new(Vec::new()));
    let mut recording = opened(
        Some(segment(&path)),
        gate(),
        Reply::Ok,
        Reply::Ok,
        log.clone(),
    );
    recording.pause().expect("pause while idle");
    assert!(seen(&log).is_empty());
    recording.start().expect("start");
    recording.pause().expect("pause and finalize");
    assert!(!recording.running);
    recording.pause().expect("repeated pause");
    recording.stop().expect("stop");
    assert_eq!(seen(&log), ["start", "pause", "stop"]);
    assert_eq!(&std::fs::read(&path).expect("finalized WAV")[..4], b"RIFF");
}

#[test]
fn pause_reply_error_or_disconnect_preserves_running_and_writer_segment() {
    for reply in [Reply::Error, Reply::Closed] {
        let output = tempfile::tempdir().expect("temporary output");
        let path = output.path().join("recording.wav");
        let log = Arc::new(Mutex::new(Vec::new()));
        let mut recording = opened(Some(segment(&path)), gate(), Reply::Ok, reply, log.clone());
        recording.start().expect("start");
        let error = recording.pause().expect_err("pause failed");
        match reply {
            Reply::Error => assert!(error.to_string().contains("fixture pause failed")),
            Reply::Closed => assert!(error.to_string().contains("lifecycle command timed out")),
            Reply::Ok => {}
        }
        assert!(recording.running);
        recording.stop().expect("finish writer on stop");
        assert_eq!(seen(&log), ["start", "pause", "stop"]);
        assert_eq!(&std::fs::read(&path).expect("WAV after stop")[..4], b"RIFF");
    }
}

#[test]
fn resume_begins_segment_then_starts_with_new_gate() {
    let output = tempfile::tempdir().expect("temporary output");
    let path = output.path().join("resumed.wav");
    let log = Arc::new(Mutex::new(Vec::new()));
    let mut recording = opened(None, gate(), Reply::Ok, Reply::Ok, log.clone());
    let new_gate = gate();
    recording
        .resume(segment(&path), new_gate.clone())
        .expect("resume");
    assert!(recording.running);
    assert!(Arc::ptr_eq(&recording.start_gate, &new_gate));
    recording.stop().expect("stop resumed capture");
    assert_eq!(seen(&log), ["start", "stop"]);
    assert_eq!(&std::fs::read(&path).expect("resumed WAV")[..4], b"RIFF");
}

#[test]
fn resume_start_failure_retains_new_gate_and_open_segment_for_stop() {
    for reply in [Reply::Error, Reply::Closed] {
        let output = tempfile::tempdir().expect("temporary output");
        let path = output.path().join("resumed.wav");
        let log = Arc::new(Mutex::new(Vec::new()));
        let mut recording = opened(None, gate(), reply, Reply::Ok, log.clone());
        let new_gate = gate();
        let error = recording
            .resume(segment(&path), new_gate.clone())
            .expect_err("start rejected");
        match reply {
            Reply::Error => assert!(error.to_string().contains("fixture start failed")),
            Reply::Closed => assert!(error.to_string().contains("lifecycle command timed out")),
            Reply::Ok => {}
        }
        assert!(!recording.running);
        assert!(Arc::ptr_eq(&recording.start_gate, &new_gate));
        recording.stop().expect("finish begun segment");
        assert_eq!(seen(&log), ["start", "stop"]);
        assert_eq!(&std::fs::read(&path).expect("finished WAV")[..4], b"RIFF");
    }
}

#[test]
fn pausing_preview_without_an_open_segment_reports_writer_failure() {
    let log = Arc::new(Mutex::new(Vec::new()));
    let mut recording = opened(None, gate(), Reply::Ok, Reply::Ok, log.clone());
    recording.start().expect("start preview");
    let error = recording.pause().expect_err("End without a segment");
    assert!(error.to_string().contains("writer command timed out"));
    assert!(recording.running);
    assert!(recording.stop().is_err());
    assert!(!recording.running);
    assert_eq!(seen(&log), ["start", "pause", "stop"]);
}

#[test]
fn resume_invalid_segment_returns_writer_error_without_replacing_gate() {
    let output = tempfile::tempdir().expect("temporary output");
    let missing = output.path().join("missing").join("recording.wav");
    let log = Arc::new(Mutex::new(Vec::new()));
    let original_gate = gate();
    let mut recording = opened(
        None,
        original_gate.clone(),
        Reply::Ok,
        Reply::Ok,
        log.clone(),
    );
    let error = recording
        .resume(segment(&missing), gate())
        .expect_err("invalid segment");
    assert_eq!(error.code(), "storage-error");
    assert!(Arc::ptr_eq(&recording.start_gate, &original_gate));
    assert!(!recording.running);
    assert!(seen(&log).is_empty());
    assert!(recording.stop().is_err());
    assert_eq!(seen(&log), ["stop"]);
}

#[test]
fn closed_writer_channel_rejects_resume_without_waiting_for_timeout() {
    let output = tempfile::tempdir().expect("temporary output");
    let path = output.path().join("never.wav");
    let log = Arc::new(Mutex::new(Vec::new()));
    let mut recording = opened(None, gate(), Reply::Ok, Reply::Ok, log.clone());
    recording
        .sink
        .send(SinkMessage::Finish)
        .expect("finish writer");
    let deadline = Instant::now() + Duration::from_millis(100);
    while recording
        .writer
        .as_ref()
        .is_some_and(|writer| !writer.is_finished())
        && Instant::now() < deadline
    {
        thread::yield_now();
    }
    assert!(
        recording
            .writer
            .as_ref()
            .is_some_and(JoinHandle::is_finished)
    );
    let error = recording
        .resume(segment(&path), gate())
        .expect_err("closed writer");
    assert!(error.to_string().contains("writer channel is closed"));
    assert!(!recording.running);
    assert!(!path.exists());
    assert!(recording.stop().is_err());
    assert_eq!(seen(&log), ["stop"]);
}
