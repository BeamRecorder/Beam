#![cfg(test)]
#![allow(clippy::expect_used, clippy::panic)]

use super::*;
use crate::NativeCaptureErrorCode;
use std::sync::atomic::{AtomicBool, Ordering};

fn format() -> SystemAudioFormat {
    SystemAudioFormat {
        sample_rate: 48_000,
        channels: 2,
    }
}

fn gate() -> Arc<StartGate> {
    let gate = Arc::new(StartGate::new());
    gate.release(0).expect("release fixture gate");
    gate
}

fn segment(path: &std::path::Path) -> SystemAudioSegment {
    SystemAudioSegment {
        path: path.to_path_buf(),
        start_ns: 0,
    }
}

fn ready_worker(
    commands: pw::channel::Receiver<Command>,
    sink: Sender<SinkMessage>,
    _fatal: Arc<Mutex<Option<CaptureError>>>,
    metrics: Arc<SystemAudioMetrics>,
    _start_gate: Arc<StartGate>,
    persist_samples: bool,
    ready: mpsc::SyncSender<Result<SystemAudioFormat, CaptureError>>,
) -> Result<(), CaptureError> {
    pw::init();
    let mainloop = pw::main_loop::MainLoopRc::new(None).map_err(pipewire_error)?;
    let command_loop = mainloop.clone();
    let _attached = commands.attach(mainloop.loop_(), move |command| match command {
        Command::Start { reply, .. } => {
            metrics.received(1);
            if persist_samples {
                let _ = sink.send(SinkMessage::Samples(vec![0; 8]));
            }
            let _ = reply.send(Ok(()));
        }
        Command::Pause { reply } => {
            let _ = reply.send(Ok(()));
        }
        Command::Stop => command_loop.quit(),
    });
    ready
        .send(Ok(format()))
        .map_err(|error| CaptureError::Backend(error.to_string()))?;
    mainloop.run();
    Ok(())
}

#[test]
fn zero_queue_capacity_rejects_before_worker_is_spawned() {
    let called = Arc::new(AtomicBool::new(false));
    let witness = called.clone();
    let error = PipewireSystemAudioRecording::open_inner_with_worker(
        SystemAudioSelection::DefaultOutput,
        None,
        gate(),
        0,
        move |_, _, _, _, _, _, _| {
            witness.store(true, Ordering::SeqCst);
            Ok(())
        },
    )
    .err()
    .expect("invalid capacity");
    assert_eq!(error.code(), "invalid-configuration");
    assert!(!called.load(Ordering::SeqCst));
}

#[test]
fn readiness_error_is_returned_and_worker_is_joined() {
    let exited = Arc::new(AtomicBool::new(false));
    let witness = exited.clone();
    let error = PipewireSystemAudioRecording::open_inner_with_worker(
        SystemAudioSelection::DefaultOutput,
        None,
        gate(),
        1,
        move |_, _, _, _, _, _, ready| {
            ready
                .send(Err(CaptureError::Backend("fixture readiness error".into())))
                .expect("send readiness error");
            witness.store(true, Ordering::SeqCst);
            Ok(())
        },
    )
    .err()
    .expect("readiness failure");
    assert!(error.to_string().contains("fixture readiness error"));
    assert!(exited.load(Ordering::SeqCst));
}

#[test]
fn worker_error_overrides_readiness_error_after_join() {
    let error = PipewireSystemAudioRecording::open_inner_with_worker(
        SystemAudioSelection::DefaultOutput,
        None,
        gate(),
        1,
        |_, _, _, _, _, _, ready| {
            ready
                .send(Err(CaptureError::Backend("readiness".into())))
                .expect("send readiness error");
            Err(CaptureError::Backend("worker failed".into()))
        },
    )
    .err()
    .expect("worker failure");
    assert!(error.to_string().contains("worker failed"));
}

#[test]
fn worker_exit_or_panic_before_readiness_reports_pipewire_failure() {
    for panic in [false, true] {
        let error = PipewireSystemAudioRecording::open_inner_with_worker(
            SystemAudioSelection::DefaultOutput,
            None,
            gate(),
            1,
            move |_, _, _, _, _, _, _ready| {
                if panic {
                    panic!("fixture panic before ready");
                }
                Ok(())
            },
        )
        .err()
        .expect("missing readiness");
        assert_eq!(
            error.code(),
            NativeCaptureErrorCode::PipewireConnectFailed.as_str()
        );
    }
}

#[test]
fn fatal_error_takes_priority_over_readiness_error() {
    let error = PipewireSystemAudioRecording::open_inner_with_worker(
        SystemAudioSelection::DefaultOutput,
        None,
        gate(),
        1,
        |_, _, fatal, _, _, _, ready| {
            set_fatal(&fatal, CaptureError::Backend("fatal fixture".into()));
            ready
                .send(Err(CaptureError::Backend("readiness fixture".into())))
                .expect("send error");
            Ok(())
        },
    )
    .err()
    .expect("fatal failure");
    assert!(error.to_string().contains("fatal fixture"));
}

#[test]
fn preview_opens_without_wav_and_stops_idempotently() {
    let mut recording = PipewireSystemAudioRecording::open_inner_with_worker(
        SystemAudioSelection::DefaultOutput,
        None,
        gate(),
        4,
        ready_worker,
    )
    .expect("preview opens");
    assert_eq!(recording.format(), format());
    assert!(!recording.running);
    recording.start().expect("start preview");
    assert!(recording.running);
    assert_eq!(recording.metrics().samples_received(), 1);
    recording.stop().expect("stop preview");
    assert!(!recording.running);
    recording.stop().expect("second stop");
    assert_eq!(
        recording.start().err().as_ref().map(CaptureError::code),
        Some(NativeCaptureErrorCode::PipewireConnectFailed.as_str())
    );
}

#[test]
fn valid_segment_writes_samples_and_finalizes_wav_on_stop() {
    let output = tempfile::tempdir().expect("temporary directory");
    let path = output.path().join("audio.wav");
    let mut recording = PipewireSystemAudioRecording::open_inner_with_worker(
        SystemAudioSelection::DefaultOutput,
        Some(segment(&path)),
        gate(),
        4,
        ready_worker,
    )
    .expect("recording opens");
    assert!(path.exists());
    recording.start().expect("start recording");
    recording.stop().expect("finish recording");
    let bytes = std::fs::read(&path).expect("read WAV");
    assert_eq!(&bytes[..4], b"RIFF");
    assert_eq!(&bytes[8..12], b"WAVE");
    assert_eq!(&bytes[36..40], b"data");
    assert_eq!(
        u32::from_le_bytes(bytes[40..44].try_into().expect("data size")),
        8
    );
    assert_eq!(bytes.len(), 52);
    assert_eq!(recording.metrics().samples_received(), 1);
}

#[test]
fn recording_pause_and_resume_finalize_two_distinct_segments() {
    let output = tempfile::tempdir().expect("temporary directory");
    let first = output.path().join("first.wav");
    let second = output.path().join("second.wav");
    let mut recording = PipewireSystemAudioRecording::open_inner_with_worker(
        SystemAudioSelection::DefaultOutput,
        Some(segment(&first)),
        gate(),
        4,
        ready_worker,
    )
    .expect("recording opens");
    recording.start().expect("start first segment");
    recording.pause().expect("pause and finalize first segment");
    assert!(!recording.running);
    assert_eq!(&std::fs::read(&first).expect("first WAV")[..4], b"RIFF");
    recording.pause().expect("second pause is inert");
    recording
        .resume(segment(&second), gate())
        .expect("resume second segment");
    assert!(recording.running);
    recording.stop().expect("finalize second segment");
    for path in [&first, &second] {
        let bytes = std::fs::read(path).expect("segment WAV");
        assert_eq!(&bytes[..4], b"RIFF");
        assert_eq!(
            u32::from_le_bytes(bytes[40..44].try_into().expect("size")),
            8
        );
    }
    assert_eq!(recording.metrics().samples_received(), 2);
}

#[test]
fn fatal_set_after_successful_readiness_is_reported_on_stop() {
    let mut recording = PipewireSystemAudioRecording::open_inner_with_worker(
        SystemAudioSelection::DefaultOutput,
        None,
        gate(),
        2,
        |_, _, fatal, _, _, _, ready| {
            ready.send(Ok(format())).expect("ready");
            set_fatal(&fatal, CaptureError::Backend("late fatal".into()));
            Ok(())
        },
    )
    .expect("readiness succeeded");
    let error = recording.stop().expect_err("fatal on stop");
    assert!(error.to_string().contains("late fatal"));
    recording.stop().expect("idempotent after fatal consumed");
}

#[test]
fn worker_panic_after_readiness_finishes_writer_before_stop_returns() {
    let mut recording = PipewireSystemAudioRecording::open_inner_with_worker(
        SystemAudioSelection::DefaultOutput,
        None,
        gate(),
        1,
        |_, _, _, _, _, _, ready| {
            ready.send(Ok(format())).expect("ready");
            panic!("fixture panic after ready");
        },
    )
    .expect("readiness succeeded");
    let error = recording.stop().expect_err("worker panic");
    assert!(error.to_string().contains("worker panicked"));
    recording.stop().expect("idempotent after panic");
}

#[test]
fn wav_create_failure_sends_stop_and_joins_worker() {
    let output = tempfile::tempdir().expect("temporary directory");
    let missing = output.path().join("missing").join("audio.wav");
    let exited = Arc::new(AtomicBool::new(false));
    let witness = exited.clone();
    let error = PipewireSystemAudioRecording::open_inner_with_worker(
        SystemAudioSelection::DefaultOutput,
        Some(segment(&missing)),
        gate(),
        4,
        move |commands, sink, fatal, metrics, start_gate, persist_samples, ready| {
            let result = ready_worker(
                commands,
                sink,
                fatal,
                metrics,
                start_gate,
                persist_samples,
                ready,
            );
            witness.store(true, Ordering::SeqCst);
            result
        },
    )
    .err()
    .expect("WAV path failure");
    assert_eq!(error.code(), "storage-error");
    assert!(!missing.exists());
    assert!(exited.load(Ordering::SeqCst));
}

#[test]
fn invalid_wav_format_surfaces_writer_error_at_stop() {
    let output = tempfile::tempdir().expect("temporary directory");
    let path = output.path().join("bad-format.wav");
    let mut recording = PipewireSystemAudioRecording::open_inner_with_worker(
        SystemAudioSelection::DefaultOutput,
        Some(segment(&path)),
        gate(),
        4,
        |commands, sink, fatal, metrics, start_gate, persist_samples, ready| {
            ready
                .send(Ok(SystemAudioFormat {
                    sample_rate: u32::MAX,
                    channels: 2,
                }))
                .expect("ready");
            let _ = (commands, sink, fatal, metrics, start_gate, persist_samples);
            Ok(())
        },
    )
    .expect("WAV file created before finalization");
    let error = recording.stop().expect_err("byte rate overflow");
    assert!(error.to_string().contains("byte rate overflowed"));
    assert_eq!(std::fs::metadata(&path).expect("WAV file").len(), 44);
    recording.stop().expect("idempotent after writer failure");
}

#[test]
fn finish_marker_reaches_a_writer_with_available_capacity() {
    let (sink, receiver) = crossbeam_channel::bounded(1);
    assert!(finish_worker_sink(&sink, Duration::from_millis(1)).is_ok());
    assert!(matches!(receiver.try_recv(), Ok(SinkMessage::Finish)));
}

#[test]
fn finish_marker_fails_promptly_when_no_writer_can_drain_a_full_queue() {
    let (sink, receiver) = crossbeam_channel::bounded(1);
    sink.try_send(SinkMessage::Samples(vec![0; 8]))
        .map_err(|_| ())
        .expect("fill queue");
    let error = finish_worker_sink(&sink, Duration::from_millis(1)).expect_err("full queue");
    assert!(error.to_string().contains("did not accept shutdown"));
    assert!(matches!(receiver.try_recv(), Ok(SinkMessage::Samples(_))));
}

#[test]
fn finish_marker_reports_a_disconnected_writer() {
    let (sink, receiver) = crossbeam_channel::bounded(1);
    drop(receiver);
    let error = finish_worker_sink(&sink, Duration::from_millis(1)).expect_err("writer gone");
    assert!(error.to_string().contains("did not accept shutdown"));
}

#[path = "open_lifecycle.rs"]
mod lifecycle_checks;
