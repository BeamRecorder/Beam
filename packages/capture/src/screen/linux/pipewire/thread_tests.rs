#![allow(clippy::expect_used, clippy::panic)]

use std::{
    path::PathBuf,
    sync::{Arc, Mutex, mpsc},
    thread,
};

use crate::{
    CaptureError, NativeCaptureErrorCode,
    screen::{
        CursorSampleState, OwnedScreenSample, ScreenDiscontinuity, ScreenSampleSink, ScreenSegment,
        VideoFormat,
    },
    session::StartGate,
};

use super::*;

#[derive(Debug)]
enum ObservedCommand {
    Start {
        start_ns: u64,
        start_gate: Arc<StartGate>,
    },
    Pause,
    Stop,
}

type CommandLog = Arc<Mutex<Vec<ObservedCommand>>>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CommandKind {
    Start,
    Pause,
    Stop,
}

#[derive(Debug, PartialEq, Eq)]
enum SinkEvent {
    BeginSegment(ScreenSegment),
    EndSegment,
    Finish,
}

type SinkEventLog = Arc<Mutex<Vec<SinkEvent>>>;

struct TestSink {
    events: Arc<Mutex<Vec<SinkEvent>>>,
    fail_begin_segment: bool,
}

impl ScreenSampleSink for TestSink {
    fn begin_segment(&mut self, segment: ScreenSegment) -> Result<(), CaptureError> {
        self.events
            .lock()
            .expect("sink event log lock")
            .push(SinkEvent::BeginSegment(segment));
        if self.fail_begin_segment {
            return Err(CaptureError::InvalidConfiguration(
                "test segment rejected".into(),
            ));
        }
        Ok(())
    }

    fn format_changed(&mut self, _: VideoFormat) -> Result<(), CaptureError> {
        Ok(())
    }

    fn push(&mut self, _: OwnedScreenSample) -> Result<(), CaptureError> {
        Ok(())
    }

    fn push_cursor(&mut self, _: u64, _: CursorSampleState) -> Result<(), CaptureError> {
        Ok(())
    }

    fn discontinuity(&mut self, _: ScreenDiscontinuity) -> Result<(), CaptureError> {
        Ok(())
    }

    fn end_segment(&mut self) -> Result<(), CaptureError> {
        self.events
            .lock()
            .expect("sink event log lock")
            .push(SinkEvent::EndSegment);
        Ok(())
    }

    fn finish(&mut self) -> Result<(), CaptureError> {
        self.events
            .lock()
            .expect("sink event log lock")
            .push(SinkEvent::Finish);
        Ok(())
    }
}

fn capture_fixture(
    start_gate: Arc<StartGate>,
    start_ns: u64,
    fail_begin_segment: bool,
) -> (PipewireCapture, CommandLog, SinkEventLog) {
    let (commands, receiver) = pw::channel::channel::<PipewireCommand>();
    let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
    let commands_seen = Arc::new(Mutex::new(Vec::new()));
    let worker_commands_seen = commands_seen.clone();

    let (sink, sink_receiver) = crossbeam_channel::bounded(8);
    let (cursor_sender, cursor_receiver) = crossbeam_channel::bounded(8);
    drop(cursor_sender);
    let sink_events = Arc::new(Mutex::new(Vec::new()));
    let fatal = Arc::new(Mutex::new(None));
    let sink_thread = {
        let sink_events = sink_events.clone();
        let sink_fatal = fatal.clone();
        thread::Builder::new()
            .name("beam-test-screen-sink".into())
            .spawn(move || {
                sink_worker(
                    Box::new(TestSink {
                        events: sink_events,
                        fail_begin_segment,
                    }),
                    sink_receiver,
                    cursor_receiver,
                    sink_fatal,
                )
            })
            .expect("spawn fake screen sink worker")
    };

    let finish_sender = sink.clone();
    let pipewire_thread = thread::Builder::new()
        .name("beam-test-pipewire-loop".into())
        .spawn(move || {
            pw::init();
            let mainloop =
                pw::main_loop::MainLoopRc::new(None).expect("create local PipeWire loop");
            let command_loop = mainloop.clone();
            let attached = receiver.attach(mainloop.loop_(), move |command| match command {
                PipewireCommand::Start {
                    start_ns,
                    start_gate,
                    reply,
                } => {
                    worker_commands_seen.lock().expect("command log lock").push(
                        ObservedCommand::Start {
                            start_ns,
                            start_gate,
                        },
                    );
                    let _ = reply.send(Ok(()));
                }
                PipewireCommand::Pause { reply } => {
                    worker_commands_seen
                        .lock()
                        .expect("command log lock")
                        .push(ObservedCommand::Pause);
                    let _ = reply.send(Ok(()));
                }
                PipewireCommand::Stop => {
                    worker_commands_seen
                        .lock()
                        .expect("command log lock")
                        .push(ObservedCommand::Stop);
                    command_loop.quit();
                }
            });
            ready_sender.send(()).expect("signal local loop readiness");
            mainloop.run();
            drop(attached);
            let _ = finish_sender.send(SinkMessage::Finish);
            Ok(())
        })
        .expect("spawn fake PipeWire loop");
    ready_receiver
        .recv()
        .expect("wait for local PipeWire loop readiness");

    (
        PipewireCapture {
            commands: Some(commands),
            thread: Some(pipewire_thread),
            sink_thread: Some(sink_thread),
            fatal,
            sink,
            format: VideoFormat {
                width: 1920,
                height: 1080,
                stride: 1920 * 4,
                pixel_format: crate::screen::PixelFormat::Bgra8,
            },
            start_ns,
            start_gate,
            running: false,
        },
        commands_seen,
        sink_events,
    )
}

fn command_kinds(commands: &[ObservedCommand]) -> Vec<CommandKind> {
    commands
        .iter()
        .map(|command| match command {
            ObservedCommand::Start { .. } => CommandKind::Start,
            ObservedCommand::Pause => CommandKind::Pause,
            ObservedCommand::Stop => CommandKind::Stop,
        })
        .collect()
}

fn assert_armed_gate_error(result: Result<(), CaptureError>) {
    match result {
        Err(CaptureError::InvalidTransition { from, to }) => {
            assert_eq!(from, "Armed");
            assert_eq!(to, "Recording");
        }
        other => panic!("expected Armed -> Recording transition error, got {other:?}"),
    }
}

fn assert_start_command(command: &ObservedCommand, start_ns: u64, gate: &Arc<StartGate>) {
    match command {
        ObservedCommand::Start {
            start_ns: actual_start_ns,
            start_gate: actual_gate,
        } => {
            assert_eq!(*actual_start_ns, start_ns);
            assert!(Arc::ptr_eq(actual_gate, gate));
        }
        ObservedCommand::Pause | ObservedCommand::Stop => {
            panic!("expected Start command, got {command:?}")
        }
    }
}

#[test]
fn start_rejects_armed_and_cancelled_gates_without_sending_start() {
    for cancelled in [false, true] {
        let gate = Arc::new(StartGate::new());
        if cancelled {
            gate.cancel();
        }
        let (mut capture, commands_seen, _) = capture_fixture(gate, 17, false);

        assert_armed_gate_error(capture.start());
        assert!(!capture.running);
        capture.stop().expect("stop fake PipeWire capture");

        let commands = commands_seen.lock().expect("command log lock");
        assert_eq!(command_kinds(&commands), [CommandKind::Stop]);
    }
}

#[test]
fn start_sends_the_released_gate_and_session_timestamp_and_marks_running() {
    let start_ns = 42_000_000;
    let gate = Arc::new(StartGate::new());
    gate.release(start_ns).expect("release start gate");
    let (mut capture, commands_seen, _) = capture_fixture(gate.clone(), start_ns, false);

    capture.start().expect("start released PipeWire capture");

    assert!(capture.running);
    let commands = commands_seen.lock().expect("command log lock");
    assert_eq!(command_kinds(&commands), [CommandKind::Start]);
    assert_start_command(&commands[0], start_ns, &gate);
    drop(commands);
    capture.stop().expect("stop fake PipeWire capture");
}

#[test]
fn prepare_resume_begins_a_segment_without_starting_until_its_gate_is_released() {
    let initial_start_ns = 100;
    let initial_gate = Arc::new(StartGate::new());
    initial_gate
        .release(initial_start_ns)
        .expect("release initial gate");
    let (mut capture, commands_seen, sink_events) =
        capture_fixture(initial_gate.clone(), initial_start_ns, false);
    capture.start().expect("start initial segment");
    capture.pause().expect("pause initial segment");
    assert!(!capture.running);

    let resume_start_ns = 200;
    let resume_gate = Arc::new(StartGate::new());
    let segment = ScreenSegment {
        path: PathBuf::from("resume-segment.mkv"),
        start_ns: resume_start_ns,
    };
    capture
        .prepare_resume(resume_start_ns, resume_gate.clone(), Some(segment.clone()))
        .expect("prepare resume segment");

    assert!(!capture.running);
    assert_eq!(
        *sink_events.lock().expect("sink event log lock"),
        [SinkEvent::EndSegment, SinkEvent::BeginSegment(segment)]
    );
    assert_armed_gate_error(capture.start());
    assert_eq!(
        command_kinds(&commands_seen.lock().expect("command log lock")),
        [CommandKind::Start, CommandKind::Pause]
    );

    resume_gate
        .release(resume_start_ns)
        .expect("release resume gate");
    capture.start().expect("start released resume segment");
    assert!(capture.running);

    let commands = commands_seen.lock().expect("command log lock");
    assert_eq!(
        command_kinds(&commands),
        [CommandKind::Start, CommandKind::Pause, CommandKind::Start]
    );
    assert_start_command(&commands[0], initial_start_ns, &initial_gate);
    assert_start_command(&commands[2], resume_start_ns, &resume_gate);
    drop(commands);
    capture.stop().expect("stop fake PipeWire capture");
}

#[test]
fn prepare_resume_preserves_a_sink_segment_error_and_stays_inactive() {
    let gate = Arc::new(StartGate::new());
    let (mut capture, commands_seen, sink_events) = capture_fixture(gate.clone(), 10, true);
    let segment = ScreenSegment {
        path: PathBuf::from("rejected-segment.mkv"),
        start_ns: 20,
    };

    let error = capture
        .prepare_resume(20, gate, Some(segment.clone()))
        .expect_err("failed segment preparation");

    assert_eq!(
        error.code(),
        NativeCaptureErrorCode::ScreenSinkFailed.as_str()
    );
    assert!(error.to_string().contains("test segment rejected"));
    assert!(!capture.running);
    assert_eq!(
        *sink_events.lock().expect("sink event log lock"),
        [SinkEvent::BeginSegment(segment)]
    );
    capture.stop().expect_err("stop preserves sink failure");
    assert_eq!(
        command_kinds(&commands_seen.lock().expect("command log lock")),
        [CommandKind::Stop]
    );
}

#[test]
fn start_after_stop_keeps_the_stopped_capture_error() {
    let start_ns = 31;
    let gate = Arc::new(StartGate::new());
    gate.release(start_ns).expect("release start gate");
    let (mut capture, commands_seen, _) = capture_fixture(gate, start_ns, false);
    capture.stop().expect("stop fake PipeWire capture");

    let error = capture.start().expect_err("stopped capture cannot start");

    assert_eq!(
        error.code(),
        NativeCaptureErrorCode::PipewireConnectFailed.as_str()
    );
    assert!(
        error
            .to_string()
            .contains("PipeWire capture is already stopped")
    );
    assert!(!capture.running);
    assert_eq!(
        command_kinds(&commands_seen.lock().expect("command log lock")),
        [CommandKind::Stop]
    );
}
