#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;

struct ListenerFixture {
    state: Rc<RefCell<ProcessState>>,
    ready: ReadySender,
    ready_rx: mpsc::Receiver<Result<NegotiatedFormat, AudioError>>,
    terminal: Receiver<AudioEvent>,
}

fn listener_fixture(initial_format: Option<NegotiatedFormat>) -> ListenerFixture {
    let (packet_tx, _) = crossbeam_channel::bounded(1);
    let (event_tx, _) = crossbeam_channel::bounded(1);
    let (terminal_tx, terminal_events) = crossbeam_channel::bounded(1);
    let (ready_tx, ready_rx) = mpsc::sync_channel(1);
    let state = Rc::new(RefCell::new(ProcessState {
        format: initial_format,
        clock: SessionClock::start(),
        gate: Arc::new(StartGate::new()),
        sample_clock: None,
        gate_epoch: 0,
        next_sample: 0,
        active: false,
        packet_tx,
        event_tx,
        terminal_tx,
        queued_bytes: Arc::new(AtomicUsize::new(0)),
        byte_limit: 1024,
        last_native_timestamp_ns: None,
        native_timestamps_invalidated: false,
    }));
    ListenerFixture {
        state,
        ready: Rc::new(RefCell::new(Some(ready_tx))),
        ready_rx,
        terminal: terminal_events,
    }
}

#[test]
fn listener_failure_reaches_ready_and_terminal_channels() {
    let ListenerFixture {
        state,
        ready,
        ready_rx,
        terminal,
    } = listener_fixture(None);
    report_listener_failure(&state, &ready, "stream disconnected".into());
    assert!(matches!(
        ready_rx.try_recv(),
        Ok(Err(AudioError::Backend(reason))) if reason == "stream disconnected"
    ));
    assert!(matches!(
        terminal.try_recv(),
        Ok(AudioEvent::Failed(reason)) if reason == "stream disconnected"
    ));
    assert!(ready.borrow().is_none());
}

#[test]
fn listener_ready_result_is_consumed_once_across_multiple_failures() {
    let ListenerFixture {
        state,
        ready,
        ready_rx,
        terminal,
    } = listener_fixture(None);
    report_listener_failure(&state, &ready, "first failure".into());
    assert!(matches!(ready_rx.try_recv(), Ok(Err(_))));
    assert!(matches!(terminal.try_recv(), Ok(AudioEvent::Failed(_))));
    report_listener_failure(&state, &ready, "second failure".into());
    assert!(ready_rx.try_recv().is_err());
    assert!(matches!(
        terminal.try_recv(),
        Ok(AudioEvent::Failed(reason)) if reason == "second failure"
    ));
}

#[test]
fn listener_failure_preserves_a_saturated_terminal_event() {
    let ListenerFixture {
        state,
        ready,
        ready_rx,
        terminal,
    } = listener_fixture(None);
    state
        .borrow()
        .terminal_tx
        .try_send(AudioEvent::DeviceChanged("output removed".into()))
        .expect("fill terminal channel");
    report_listener_failure(&state, &ready, "stream failed".into());
    assert!(matches!(ready_rx.try_recv(), Ok(Err(_))));
    assert!(matches!(
        terminal.try_recv(),
        Ok(AudioEvent::DeviceChanged(reason)) if reason == "output removed"
    ));
    assert!(terminal.try_recv().is_err());
}

#[test]
fn listener_failure_with_full_ready_channel_still_reports_terminal_failure() {
    let ListenerFixture {
        state,
        ready,
        ready_rx,
        terminal,
    } = listener_fixture(None);
    ready
        .borrow()
        .as_ref()
        .expect("ready sender")
        .try_send(Ok(stereo_format()))
        .expect("fill ready channel");
    report_listener_failure(&state, &ready, "late failure".into());
    assert!(matches!(ready_rx.try_recv(), Ok(Ok(format)) if format == stereo_format()));
    assert!(matches!(
        terminal.try_recv(),
        Ok(AudioEvent::Failed(reason)) if reason == "late failure"
    ));
    assert!(ready.borrow().is_none());
}

#[test]
fn initial_negotiated_format_sets_state_and_reports_ready_once() {
    let ListenerFixture {
        state,
        ready,
        ready_rx,
        terminal,
    } = listener_fixture(None);
    assert!(accept_negotiated_format(&state, &ready, stereo_format()));
    assert_eq!(state.borrow().format, Some(stereo_format()));
    assert!(matches!(ready_rx.try_recv(), Ok(Ok(format)) if format == stereo_format()));
    assert!(ready.borrow().is_none());
    assert!(terminal.try_recv().is_err());
}

#[test]
fn identical_renegotiation_is_accepted_without_duplicate_ready_signal() {
    let ListenerFixture {
        state,
        ready,
        ready_rx,
        terminal,
    } = listener_fixture(None);
    assert!(accept_negotiated_format(&state, &ready, stereo_format()));
    assert!(matches!(ready_rx.try_recv(), Ok(Ok(_))));
    assert!(accept_negotiated_format(&state, &ready, stereo_format()));
    assert_eq!(state.borrow().format, Some(stereo_format()));
    assert!(ready_rx.try_recv().is_err());
    assert!(terminal.try_recv().is_err());
}

#[test]
fn format_change_is_terminal_and_keeps_last_accepted_format() {
    let ListenerFixture {
        state,
        ready,
        ready_rx,
        terminal,
    } = listener_fixture(None);
    assert!(accept_negotiated_format(&state, &ready, stereo_format()));
    assert!(matches!(ready_rx.try_recv(), Ok(Ok(_))));
    let changed = NegotiatedFormat {
        sample_rate: 44_100,
        channels: 1,
    };
    assert!(!accept_negotiated_format(&state, &ready, changed));
    assert_eq!(state.borrow().format, Some(stereo_format()));
    assert!(ready_rx.try_recv().is_err());
    assert!(matches!(
        terminal.try_recv(),
        Ok(AudioEvent::DeviceChanged(reason)) if reason == "PipeWire system output format changed"
    ));
}

#[test]
fn format_change_before_ready_does_not_acknowledge_invalid_format() {
    let ListenerFixture {
        state,
        ready,
        ready_rx,
        terminal,
    } = listener_fixture(Some(stereo_format()));
    let changed = NegotiatedFormat {
        sample_rate: 96_000,
        channels: 2,
    };
    assert!(!accept_negotiated_format(&state, &ready, changed));
    assert_eq!(state.borrow().format, Some(stereo_format()));
    assert!(ready.borrow().is_some());
    assert!(matches!(
        ready_rx.try_recv(),
        Err(mpsc::TryRecvError::Empty)
    ));
    assert!(matches!(
        terminal.try_recv(),
        Ok(AudioEvent::DeviceChanged(_))
    ));
}

#[test]
fn saturated_terminal_channel_does_not_accept_changed_format() {
    let ListenerFixture {
        state,
        ready,
        ready_rx,
        terminal,
    } = listener_fixture(Some(stereo_format()));
    state
        .borrow()
        .terminal_tx
        .try_send(AudioEvent::Failed("previous error".into()))
        .expect("fill terminal channel");
    let changed = NegotiatedFormat {
        sample_rate: 44_100,
        channels: 2,
    };
    assert!(!accept_negotiated_format(&state, &ready, changed));
    assert_eq!(state.borrow().format, Some(stereo_format()));
    assert!(ready.borrow().is_some());
    assert!(matches!(
        ready_rx.try_recv(),
        Err(mpsc::TryRecvError::Empty)
    ));
    assert!(matches!(
        terminal.try_recv(),
        Ok(AudioEvent::Failed(reason)) if reason == "previous error"
    ));
}

#[test]
fn full_ready_channel_does_not_block_initial_format_acceptance() {
    let ListenerFixture {
        state,
        ready,
        ready_rx,
        terminal,
    } = listener_fixture(None);
    ready
        .borrow()
        .as_ref()
        .expect("ready sender")
        .try_send(Err(AudioError::Backend("previous result".into())))
        .expect("fill ready channel");
    assert!(accept_negotiated_format(&state, &ready, stereo_format()));
    assert_eq!(state.borrow().format, Some(stereo_format()));
    assert!(ready.borrow().is_none());
    assert!(matches!(
        ready_rx.try_recv(),
        Ok(Err(AudioError::Backend(reason))) if reason == "previous result"
    ));
    assert!(terminal.try_recv().is_err());
}

#[test]
fn disconnected_ready_receiver_still_accepts_first_format_and_consumes_sender() {
    let ListenerFixture {
        state,
        ready,
        ready_rx,
        terminal,
    } = listener_fixture(None);
    drop(ready_rx);
    assert!(accept_negotiated_format(&state, &ready, stereo_format()));
    assert_eq!(state.borrow().format, Some(stereo_format()));
    assert!(ready.borrow().is_none());
    assert!(terminal.is_empty());
    assert!(accept_negotiated_format(&state, &ready, stereo_format()));
    assert!(terminal.is_empty());
}

#[test]
fn disconnected_ready_receiver_still_reports_terminal_listener_error() {
    let ListenerFixture {
        state,
        ready,
        ready_rx,
        terminal,
    } = listener_fixture(None);
    drop(ready_rx);
    report_listener_failure(&state, &ready, "registry closed".into());
    assert!(ready.borrow().is_none());
    assert!(matches!(
        terminal.try_recv(),
        Ok(AudioEvent::Failed(reason)) if reason == "registry closed"
    ));
}

#[test]
fn disconnected_terminal_receiver_cannot_change_last_accepted_format() {
    let ListenerFixture {
        state,
        ready,
        ready_rx,
        terminal,
    } = listener_fixture(Some(stereo_format()));
    drop(terminal);
    let changed = NegotiatedFormat {
        sample_rate: 96_000,
        channels: 1,
    };
    assert!(!accept_negotiated_format(&state, &ready, changed));
    assert_eq!(state.borrow().format, Some(stereo_format()));
    assert!(ready.borrow().is_some());
    assert!(matches!(
        ready_rx.try_recv(),
        Err(mpsc::TryRecvError::Empty)
    ));
    report_listener_failure(&state, &ready, "stream failed".into());
    assert!(ready.borrow().is_none());
    assert!(
        matches!(ready_rx.try_recv(), Ok(Err(AudioError::Backend(reason))) if reason == "stream failed")
    );
}
