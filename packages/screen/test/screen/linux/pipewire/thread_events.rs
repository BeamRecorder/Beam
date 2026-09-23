#![cfg(test)]
#![allow(clippy::expect_used, clippy::panic)]

use std::{
    cell::{Cell, RefCell},
    rc::Rc,
    sync::{Arc, Mutex, mpsc},
    time::Instant,
};

use crate::{
    NativeCaptureErrorCode,
    gate::StartGate,
    screen::{CursorSampleState, ScreenCaptureMetrics},
};

use super::super::super::{HeaderMetadata, NativePixelFormat};
use super::*;

type ReadyReceiver = mpsc::Receiver<Result<VideoFormat, CaptureError>>;

struct Fixture {
    state: Rc<RefCell<ProcessState>>,
    ready: ReadySender,
    received: ReadyReceiver,
    stopped: Rc<Cell<bool>>,
    cursor_received: crossbeam_channel::Receiver<CursorMessage>,
}

fn fixture() -> Fixture {
    let (sink, _sink_received) = crossbeam_channel::bounded(4);
    let (cursor_sink, cursor_received) = crossbeam_channel::bounded(4);
    let (sender, received) = mpsc::sync_channel(1);
    let state = ProcessState {
        cursor_allocations: Default::default(),
        negotiated: None,
        last_announced: None,
        cursor: CursorState::new("thread-events"),
        timestamp: TimestampMapper::new(7),
        start_gate: Arc::new(StartGate::new()),
        active: false,
        start_reply: None,
        stopping: false,
        clock: Instant::now(),
        sink,
        cursor_sink,
        pending_cursor: None,
        metrics: Arc::new(ScreenCaptureMetrics::default()),
        fatal: Arc::new(Mutex::new(None)),
        pending_drops: 0,
        last_frame_geometry: None,
        repair_window_crop: false,
        region: None,
    };
    Fixture {
        state: Rc::new(RefCell::new(state)),
        ready: Rc::new(RefCell::new(Some(sender))),
        received,
        stopped: Rc::new(Cell::new(false)),
        cursor_received,
    }
}

fn format() -> NegotiatedFormat {
    NegotiatedFormat::new(2, 3, NativePixelFormat::Bgra).expect("valid format")
}

fn fatal_code(fixture: &Fixture) -> Option<&'static str> {
    let state = fixture.state.borrow();
    let fatal = state.fatal.lock().expect("fatal lock");
    fatal.as_ref().map(CaptureError::code)
}

fn assert_ready_pending(fixture: &Fixture) {
    assert!(matches!(
        fixture.received.try_recv(),
        Err(mpsc::TryRecvError::Empty)
    ));
}

fn assert_ready_format(fixture: &Fixture) {
    let video = fixture
        .received
        .try_recv()
        .expect("ready message")
        .expect("valid format");
    assert_eq!((video.width, video.height, video.stride), (2, 3, 8));
    assert!(fixture.ready.borrow().is_none());
}

fn assert_ready_error(fixture: &Fixture, code: NativeCaptureErrorCode) {
    let error = fixture
        .received
        .try_recv()
        .expect("ready message")
        .expect_err("ready failure");
    assert_eq!(error.code(), code.as_str());
    assert!(fixture.ready.borrow().is_none());
}

#[test]
fn stream_error_sets_fatal_replies_and_quits() {
    let fixture = fixture();
    let quit = Cell::new(0);
    handle_stream_state(
        pw::stream::StreamState::Error("broken stream".into()),
        &fixture.state,
        &fixture.ready,
        &fixture.stopped,
        || panic!("must not pause an errored stream"),
        || quit.set(quit.get() + 1),
    );
    assert_eq!(quit.get(), 1);
    assert_eq!(
        fatal_code(&fixture),
        Some(NativeCaptureErrorCode::PipewireStreamDisconnected.as_str())
    );
    assert_ready_error(&fixture, NativeCaptureErrorCode::PipewireConnectFailed);
}

#[test]
fn paused_stream_needs_both_negotiated_format_and_stopped_negotiation() {
    for (format_present, stopped) in [(false, false), (false, true), (true, false), (true, true)] {
        let fixture = fixture();
        fixture.state.borrow_mut().negotiated = format_present.then(format);
        fixture.stopped.set(stopped);
        handle_stream_state(
            pw::stream::StreamState::Paused,
            &fixture.state,
            &fixture.ready,
            &fixture.stopped,
            || panic!("paused stream must not call set_active"),
            || panic!("paused stream must not quit"),
        );
        if format_present && stopped {
            assert_ready_format(&fixture);
        } else {
            assert_ready_pending(&fixture);
        }
    }
}

#[test]
fn streaming_without_format_or_with_prior_pause_does_not_pause_again() {
    for (format_present, stopped) in [(false, false), (false, true), (true, true)] {
        let fixture = fixture();
        fixture.state.borrow_mut().negotiated = format_present.then(format);
        fixture.stopped.set(stopped);
        handle_stream_state(
            pw::stream::StreamState::Streaming,
            &fixture.state,
            &fixture.ready,
            &fixture.stopped,
            || panic!("unexpected second pause"),
            || panic!("unexpected quit"),
        );
        assert_eq!(fixture.stopped.get(), stopped);
        assert_ready_pending(&fixture);
    }
}

#[test]
fn streaming_with_format_requests_pause_once_and_reports_pause_error() {
    for fail in [false, true] {
        let fixture = fixture();
        fixture.state.borrow_mut().negotiated = Some(format());
        let calls = Cell::new(0);
        let quits = Cell::new(0);
        handle_stream_state(
            pw::stream::StreamState::Streaming,
            &fixture.state,
            &fixture.ready,
            &fixture.stopped,
            || {
                calls.set(calls.get() + 1);
                if fail {
                    Err(CaptureError::Backend("pause failed".into()))
                } else {
                    Ok(())
                }
            },
            || quits.set(quits.get() + 1),
        );
        assert_eq!(calls.get(), 1);
        assert!(fixture.stopped.get());
        if fail {
            assert_eq!(quits.get(), 1);
            assert_eq!(
                fatal_code(&fixture),
                Some(NativeCaptureErrorCode::PipewireConnectFailed.as_str())
            );
            assert_ready_error(&fixture, NativeCaptureErrorCode::PipewireConnectFailed);
        } else {
            assert_eq!(quits.get(), 0);
            assert_ready_pending(&fixture);
        }
    }
}

#[test]
fn null_format_does_not_change_negotiation_or_call_stream() {
    let fixture = fixture();
    fixture.state.borrow_mut().negotiated = Some(format());
    handle_format_event(
        Ok(None),
        pw::stream::StreamState::Streaming,
        &fixture.state,
        &fixture.ready,
        &fixture.stopped,
        |_| panic!("null format must not update buffers"),
        || panic!("null format must not pause"),
        || panic!("null format must not quit"),
    );
    assert_eq!(fixture.state.borrow().negotiated, Some(format()));
    assert_ready_pending(&fixture);
}

#[test]
fn invalid_format_and_buffer_param_failure_report_distinct_fatal_errors() {
    for invalid_format in [false, true] {
        let fixture = fixture();
        let quits = Cell::new(0);
        handle_format_event(
            if invalid_format {
                Err(CaptureError::Backend("invalid format".into()))
            } else {
                Ok(Some(format()))
            },
            pw::stream::StreamState::Paused,
            &fixture.state,
            &fixture.ready,
            &fixture.stopped,
            |_| Err(CaptureError::Backend("update failed".into())),
            || panic!("failure must not pause"),
            || quits.set(quits.get() + 1),
        );
        assert_eq!(quits.get(), 1);
        assert_eq!(fatal_code(&fixture), Some("capture-error"));
        assert_eq!(
            fixture.state.borrow().negotiated,
            (!invalid_format).then(format)
        );
        assert_ready_error(&fixture, NativeCaptureErrorCode::PipewireFormatUnsupported);
    }
}

#[test]
fn concrete_format_updates_params_and_waits_or_replies_by_stream_state() {
    for stream_kind in 0..3 {
        for stopped in [false, true] {
            let stream_state = match stream_kind {
                0 => pw::stream::StreamState::Connecting,
                1 => pw::stream::StreamState::Paused,
                _ => pw::stream::StreamState::Streaming,
            };
            let is_paused = matches!(stream_state, pw::stream::StreamState::Paused);
            let is_streaming = matches!(stream_state, pw::stream::StreamState::Streaming);
            let fixture = fixture();
            fixture.stopped.set(stopped);
            let updates = Cell::new(0);
            let pauses = Cell::new(0);
            handle_format_event(
                Ok(Some(format())),
                stream_state,
                &fixture.state,
                &fixture.ready,
                &fixture.stopped,
                |received| {
                    assert_eq!(received, format());
                    updates.set(updates.get() + 1);
                    Ok(())
                },
                || {
                    pauses.set(pauses.get() + 1);
                    Ok(())
                },
                || panic!("valid format must not quit"),
            );
            assert_eq!(updates.get(), 1);
            assert_eq!(fixture.state.borrow().negotiated, Some(format()));
            let should_pause = is_streaming && !stopped;
            assert_eq!(pauses.get(), usize::from(should_pause));
            assert_eq!(fixture.stopped.get(), stopped || should_pause);
            if is_paused && stopped {
                assert_ready_format(&fixture);
            } else {
                assert_ready_pending(&fixture);
            }
        }
    }
}

#[test]
fn concrete_format_pause_error_is_fatal_and_completes_ready_with_error() {
    let fixture = fixture();
    let quit = Cell::new(false);
    handle_format_event(
        Ok(Some(format())),
        pw::stream::StreamState::Streaming,
        &fixture.state,
        &fixture.ready,
        &fixture.stopped,
        |_| Ok(()),
        || Err(CaptureError::Backend("set_active failed".into())),
        || quit.set(true),
    );
    assert!(quit.get());
    assert!(fixture.stopped.get());
    assert_eq!(
        fatal_code(&fixture),
        Some(NativeCaptureErrorCode::PipewireConnectFailed.as_str())
    );
    assert_ready_error(&fixture, NativeCaptureErrorCode::PipewireConnectFailed);
}

#[test]
fn start_sets_new_gate_and_timestamp_then_waits_for_frame_on_success() {
    let fixture = fixture();
    let gate = Arc::new(StartGate::new());
    let (reply, receiver) = mpsc::sync_channel(1);
    let calls = RefCell::new(Vec::new());
    handle_command(
        PipewireCommand::Start {
            start_ns: 987,
            start_gate: gate.clone(),
            reply,
        },
        &fixture.state,
        |active| {
            calls.borrow_mut().push(active);
            Ok(())
        },
        || panic!("start must not flush"),
        || panic!("start must not disconnect"),
        || panic!("start must not quit"),
    );
    assert_eq!(*calls.borrow(), [true]);
    let mut state = fixture.state.borrow_mut();
    assert!(state.active);
    assert!(Arc::ptr_eq(&state.start_gate, &gate));
    assert!(state.start_reply.is_some());
    let header = HeaderMetadata {
        pts_ns: Some(100),
        ..HeaderMetadata::default()
    };
    let mapped = state.timestamp.map(header, 100).expect("map timestamp");
    assert_eq!(mapped.session_ns, 987);
    assert!(matches!(
        receiver.try_recv(),
        Err(mpsc::TryRecvError::Empty)
    ));
}

#[test]
fn start_failure_replies_immediately_and_records_fatal() {
    let fixture = fixture();
    let (reply, receiver) = mpsc::sync_channel(1);
    handle_command(
        PipewireCommand::Start {
            start_ns: 15,
            start_gate: Arc::new(StartGate::new()),
            reply,
        },
        &fixture.state,
        |active| {
            assert!(active);
            Err(CaptureError::Backend("start failed".into()))
        },
        || panic!("start must not flush"),
        || panic!("start must not disconnect"),
        || panic!("start must not quit"),
    );
    assert!(fixture.state.borrow().active);
    assert!(fixture.state.borrow().start_reply.is_none());
    assert_eq!(
        fatal_code(&fixture),
        Some(NativeCaptureErrorCode::PipewireConnectFailed.as_str())
    );
    assert!(receiver.try_recv().expect("start reply").is_err());
}

fn set_pending_cursor(fixture: &Fixture) {
    fixture.state.borrow_mut().pending_cursor = Some(CursorMessage {
        session_ns: 45,
        cursor: CursorSampleState::Unknown,
    });
}

#[test]
fn pause_flushes_pending_cursor_then_deactivates_and_flushes_stream() {
    let fixture = fixture();
    fixture.state.borrow_mut().active = true;
    set_pending_cursor(&fixture);
    let (reply, receiver) = mpsc::sync_channel(1);
    let operations = RefCell::new(Vec::new());
    handle_command(
        PipewireCommand::Pause { reply },
        &fixture.state,
        |active| {
            operations.borrow_mut().push("active");
            assert!(!active);
            Ok(())
        },
        || {
            operations.borrow_mut().push("flush");
            Ok(())
        },
        || panic!("pause must not disconnect"),
        || panic!("pause must not quit"),
    );
    assert!(!fixture.state.borrow().active);
    assert!(fixture.state.borrow().pending_cursor.is_none());
    let cursor = fixture.cursor_received.try_recv().expect("pending cursor");
    assert_eq!(cursor.session_ns, 45);
    assert_eq!(*operations.borrow(), ["active", "flush"]);
    assert!(receiver.try_recv().expect("pause reply").is_ok());
}

#[test]
fn pause_reports_deactivation_or_flush_failure_and_short_circuits_flush() {
    for fail_deactivate in [false, true] {
        let fixture = fixture();
        let (reply, receiver) = mpsc::sync_channel(1);
        let flushes = Cell::new(0);
        handle_command(
            PipewireCommand::Pause { reply },
            &fixture.state,
            |_| {
                if fail_deactivate {
                    Err(CaptureError::Backend("deactivate failed".into()))
                } else {
                    Ok(())
                }
            },
            || {
                flushes.set(flushes.get() + 1);
                Err(CaptureError::Backend("flush failed".into()))
            },
            || panic!("pause must not disconnect"),
            || panic!("pause must not quit"),
        );
        assert_eq!(flushes.get(), usize::from(!fail_deactivate));
        assert_eq!(
            fatal_code(&fixture),
            Some(NativeCaptureErrorCode::PipewireConnectFailed.as_str())
        );
        let error = receiver
            .try_recv()
            .expect("pause reply")
            .expect_err("pause failure");
        assert!(error.to_string().contains(if fail_deactivate {
            "deactivate failed"
        } else {
            "flush failed"
        }));
    }
}

#[test]
fn stop_quits_even_when_deactivate_and_disconnect_fail() {
    for fail in [false, true] {
        let fixture = fixture();
        fixture.state.borrow_mut().active = true;
        set_pending_cursor(&fixture);
        let calls = RefCell::new(Vec::new());
        handle_command(
            PipewireCommand::Stop,
            &fixture.state,
            |active| {
                calls.borrow_mut().push("active");
                assert!(!active);
                if fail {
                    Err(CaptureError::Backend("stop deactivate".into()))
                } else {
                    Ok(())
                }
            },
            || panic!("stop must not flush stream"),
            || {
                calls.borrow_mut().push("disconnect");
                if fail {
                    Err(CaptureError::Backend("disconnect".into()))
                } else {
                    Ok(())
                }
            },
            || calls.borrow_mut().push("quit"),
        );
        assert_eq!(*calls.borrow(), ["active", "disconnect", "quit"]);
        let state = fixture.state.borrow();
        assert!(!state.active);
        assert!(state.stopping);
        assert!(state.pending_cursor.is_none());
        let cursor = fixture.cursor_received.try_recv().expect("pending cursor");
        assert_eq!(cursor.session_ns, 45);
        assert!(state.fatal.lock().expect("fatal lock").is_none());
    }
}
