#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;

#[derive(Clone, Copy)]
enum Reply {
    Ok,
    Error,
    Closed,
}

fn worker(
    config: PipewireWorkerConfig,
    start: Reply,
    pause: Reply,
    commands: Arc<Mutex<Vec<String>>>,
) -> Result<(), CaptureError> {
    pw::init();
    let mainloop = pw::main_loop::MainLoopRc::new(None).map_err(pipewire_error)?;
    let stop_loop = mainloop.clone();
    let attached = config
        .commands
        .attach(mainloop.loop_(), move |command| match command {
            PipewireCommand::Start {
                start_ns,
                start_gate,
                reply,
            } => {
                commands
                    .lock()
                    .expect("command log")
                    .push(format!("start:{start_ns}:{}", start_gate.is_released()));
                match start {
                    Reply::Ok => {
                        let _ = reply.send(Ok(()));
                    }
                    Reply::Error => {
                        let _ = reply.send(Err(pipewire_error("fixture start failed")));
                    }
                    Reply::Closed => drop(reply),
                }
            }
            PipewireCommand::Pause { reply } => {
                commands.lock().expect("command log").push("pause".into());
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
            PipewireCommand::Stop => {
                commands.lock().expect("command log").push("stop".into());
                stop_loop.quit();
            }
        });
    config
        .ready
        .send(Ok(video_format()))
        .map_err(|error| pipewire_error(error.to_string()))?;
    mainloop.run();
    drop(attached);
    Ok(())
}

fn prepared(
    fixture: Fixture,
    start: Reply,
    pause: Reply,
    commands: Arc<Mutex<Vec<String>>>,
) -> PipewireCapture {
    PipewireCapture::prepare_with_worker(fixture.request, move |config| {
        worker(config, start, pause, commands)
    })
    .expect("prepare capture")
}

fn command_log(commands: &Arc<Mutex<Vec<String>>>) -> Vec<String> {
    commands.lock().expect("command log").clone()
}

#[test]
fn start_before_gate_release_is_rejected_without_sending_start() {
    let fixture = fixture(2, false);
    let commands = Arc::new(Mutex::new(Vec::new()));
    let mut capture = prepared(fixture, Reply::Ok, Reply::Ok, commands.clone());
    let error = capture.start().expect_err("unreleased gate");
    assert_eq!(error.code(), "invalid-transition");
    assert!(!capture.running);
    assert!(command_log(&commands).is_empty());
    capture.stop().expect("stop armed capture");
    assert_eq!(command_log(&commands), ["stop"]);
}

#[test]
fn start_replies_cover_success_error_and_closed_reply_channel() {
    for reply in [Reply::Ok, Reply::Error, Reply::Closed] {
        let fixture = fixture(2, false);
        fixture.gate.release(1234).expect("release gate");
        let commands = Arc::new(Mutex::new(Vec::new()));
        let mut capture = prepared(fixture, reply, Reply::Ok, commands.clone());
        let result = capture.start();
        match reply {
            Reply::Ok => assert!(result.is_ok()),
            Reply::Error => assert!(
                result
                    .expect_err("start error")
                    .to_string()
                    .contains("fixture start failed")
            ),
            Reply::Closed => assert!(
                result
                    .expect_err("closed reply")
                    .to_string()
                    .contains("first video frame")
            ),
        }
        assert_eq!(capture.running, matches!(reply, Reply::Ok));
        capture.stop().expect("stop capture");
        assert_eq!(command_log(&commands), ["start:1234:true", "stop"]);
    }
}

#[test]
fn pause_before_running_is_inert_and_successful_pause_ends_segment_once() {
    let fixture = fixture(2, false);
    fixture.gate.release(1234).expect("release gate");
    let sink = fixture.sink.clone();
    let commands = Arc::new(Mutex::new(Vec::new()));
    let mut capture = prepared(fixture, Reply::Ok, Reply::Ok, commands.clone());
    capture.pause().expect("pause armed capture");
    assert!(command_log(&commands).is_empty());
    capture.start().expect("start");
    capture.pause().expect("pause recording");
    assert!(!capture.running);
    capture.pause().expect("repeat pause");
    capture.stop().expect("stop");
    assert_eq!(command_log(&commands), ["start:1234:true", "pause", "stop"]);
    assert_eq!(*sink.events.lock().expect("sink log"), ["end", "finish"]);
}

#[test]
fn pause_reply_errors_do_not_end_segment_or_clear_running_state() {
    for reply in [Reply::Error, Reply::Closed] {
        let fixture = fixture(2, false);
        fixture.gate.release(1234).expect("release gate");
        let sink = fixture.sink.clone();
        let commands = Arc::new(Mutex::new(Vec::new()));
        let mut capture = prepared(fixture, Reply::Ok, reply, commands.clone());
        capture.start().expect("start");
        let error = capture.pause().expect_err("pause reply failure");
        match reply {
            Reply::Error => assert!(error.to_string().contains("fixture pause failed")),
            Reply::Closed => assert!(error.to_string().contains("pause")),
            Reply::Ok => {}
        }
        assert!(capture.running);
        capture.stop().expect("stop");
        assert_eq!(command_log(&commands), ["start:1234:true", "pause", "stop"]);
        assert_eq!(*sink.events.lock().expect("sink log"), ["finish"]);
    }
}

#[test]
fn sink_end_error_keeps_capture_running_and_surfaces_again_on_stop() {
    let fixture = fixture(2, false);
    fixture.gate.release(1234).expect("release gate");
    fixture.sink.fail_end.store(true, Ordering::Release);
    let sink = fixture.sink.clone();
    let commands = Arc::new(Mutex::new(Vec::new()));
    let mut capture = prepared(fixture, Reply::Ok, Reply::Ok, commands.clone());
    capture.start().expect("start");
    let error = capture.pause().expect_err("sink EndSegment failure");
    assert!(error.to_string().contains("fixture end failed"));
    assert!(capture.running);
    let stop_error = capture.stop().expect_err("sink fatal on stop");
    assert!(stop_error.to_string().contains("fixture end failed"));
    assert!(!capture.running);
    assert_eq!(command_log(&commands), ["start:1234:true", "pause", "stop"]);
    assert_eq!(*sink.events.lock().expect("sink log"), ["end", "finish"]);
    capture.stop().expect("repeat stop after error consumed");
}

#[test]
fn resume_without_segment_updates_gate_and_start_position_without_sink_begin() {
    let fixture = fixture(2, false);
    let sink = fixture.sink.clone();
    let commands = Arc::new(Mutex::new(Vec::new()));
    let mut capture = prepared(fixture, Reply::Ok, Reply::Ok, commands.clone());
    let new_gate = Arc::new(StartGate::new());
    capture
        .prepare_resume(9_876, new_gate.clone(), None)
        .expect("resume preparation");
    assert_eq!(capture.start_ns, 9_876);
    assert!(Arc::ptr_eq(&capture.start_gate, &new_gate));
    assert_eq!(
        capture.start().expect_err("new gate unreleased").code(),
        "invalid-transition"
    );
    new_gate.release(9_876).expect("release new gate");
    capture.start().expect("start after gate release");
    capture.stop().expect("stop");
    assert_eq!(command_log(&commands), ["start:9876:true", "stop"]);
    assert_eq!(*sink.events.lock().expect("sink log"), ["finish"]);
}

#[test]
fn resume_with_segment_calls_sink_begin_before_next_start() {
    let fixture = fixture(2, false);
    let sink = fixture.sink.clone();
    let commands = Arc::new(Mutex::new(Vec::new()));
    let mut capture = prepared(fixture, Reply::Ok, Reply::Ok, commands.clone());
    let new_gate = Arc::new(StartGate::new());
    let segment = ScreenSegment {
        path: PathBuf::from("unused-segment"),
        start_ns: 5_000,
    };
    capture
        .prepare_resume(5_000, new_gate.clone(), Some(segment))
        .expect("begin segment");
    assert_eq!(*sink.events.lock().expect("sink log"), ["begin"]);
    new_gate.release(5_000).expect("release gate");
    capture.start().expect("start resumed segment");
    capture.stop().expect("stop");
    assert_eq!(command_log(&commands), ["start:5000:true", "stop"]);
    assert_eq!(*sink.events.lock().expect("sink log"), ["begin", "finish"]);
}

#[test]
fn resume_begin_error_keeps_new_gate_but_stops_with_sink_failure() {
    let fixture = fixture(2, false);
    fixture.sink.fail_begin.store(true, Ordering::Release);
    let sink = fixture.sink.clone();
    let commands = Arc::new(Mutex::new(Vec::new()));
    let mut capture = prepared(fixture, Reply::Ok, Reply::Ok, commands.clone());
    let new_gate = Arc::new(StartGate::new());
    let error = capture
        .prepare_resume(
            6_000,
            new_gate.clone(),
            Some(ScreenSegment {
                path: PathBuf::from("unused"),
                start_ns: 6_000,
            }),
        )
        .expect_err("begin failure");
    assert!(error.to_string().contains("fixture begin failed"));
    assert_eq!(capture.start_ns, 6_000);
    assert!(Arc::ptr_eq(&capture.start_gate, &new_gate));
    assert!(!capture.running);
    assert!(
        capture
            .stop()
            .expect_err("sink failure on stop")
            .to_string()
            .contains("fixture begin failed")
    );
    assert_eq!(command_log(&commands), ["stop"]);
    assert_eq!(*sink.events.lock().expect("sink log"), ["begin", "finish"]);
}

#[test]
fn closed_sink_lifecycle_channel_rejects_resume_segment_promptly() {
    let fixture = fixture(2, false);
    let commands = Arc::new(Mutex::new(Vec::new()));
    let mut capture = prepared(fixture, Reply::Ok, Reply::Ok, commands.clone());
    capture.sink.send(SinkMessage::Finish).expect("finish sink");
    let deadline = Instant::now() + Duration::from_millis(100);
    while capture
        .sink_thread
        .as_ref()
        .is_some_and(|worker| !worker.is_finished())
        && Instant::now() < deadline
    {
        thread::yield_now();
    }
    assert!(
        capture
            .sink_thread
            .as_ref()
            .is_some_and(JoinHandle::is_finished)
    );
    let error = capture
        .prepare_resume(
            7_000,
            Arc::new(StartGate::new()),
            Some(ScreenSegment {
                path: PathBuf::from("unused"),
                start_ns: 7_000,
            }),
        )
        .expect_err("closed sink");
    assert_eq!(
        error.code(),
        NativeCaptureErrorCode::ScreenSinkFailed.as_str()
    );
    assert!(error.to_string().contains("lifecycle channel is closed"));
    assert_eq!(capture.start_ns, 7_000);
    capture.stop().expect("stop after sink exit");
    assert_eq!(command_log(&commands), ["stop"]);
}

#[test]
fn fatal_state_marks_capture_unavailable_and_is_returned_once_on_stop() {
    let fixture = fixture(1, false);
    let commands = Arc::new(Mutex::new(Vec::new()));
    let mut capture = prepared(fixture, Reply::Ok, Reply::Ok, commands.clone());
    assert!(capture.is_available());
    set_fatal(
        &capture.fatal,
        CaptureError::Backend("fixture fatal".into()),
    );
    assert!(!capture.is_available());
    let error = capture.stop().expect_err("fatal failure");
    assert!(error.to_string().contains("fixture fatal"));
    capture.stop().expect("fatal consumed once");
    assert_eq!(command_log(&commands), ["stop"]);
}
