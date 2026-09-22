#![cfg(test)]
#![allow(clippy::expect_used, clippy::panic)]

use super::*;

type NegotiationFixture = (
    Rc<RefCell<ProcessState>>,
    ReadySender,
    mpsc::Receiver<Result<SystemAudioFormat, CaptureError>>,
    Rc<Cell<bool>>,
);

fn fixture() -> NegotiationFixture {
    let (sink, _) = crossbeam_channel::bounded(1);
    let gate = Arc::new(StartGate::new());
    let state = Rc::new(RefCell::new(ProcessState {
        format: None,
        active: false,
        stopping: false,
        gate,
        sink,
        persist_samples: false,
        metrics: Arc::new(SystemAudioMetrics::default()),
        fatal: Arc::new(Mutex::new(None)),
    }));
    let (sender, receiver) = mpsc::sync_channel(1);
    (
        state,
        Rc::new(RefCell::new(Some(sender))),
        receiver,
        Rc::new(Cell::new(false)),
    )
}

fn format() -> SystemAudioFormat {
    SystemAudioFormat {
        sample_rate: 48_000,
        channels: 2,
    }
}

#[test]
fn stream_error_reports_readiness_and_terminal_failure() {
    let (state, ready, receiver, stopped) = fixture();
    let quit = Cell::new(false);
    handle_state_changed(
        pw::stream::StreamState::Error("fixture stream lost".into()),
        &state,
        &ready,
        &stopped,
        || Ok(()),
        || quit.set(true),
    );
    let error = receiver
        .try_recv()
        .expect("readiness result")
        .expect_err("error");
    assert!(error.to_string().contains("fixture stream lost"));
    assert!(
        take_fatal(&state.borrow().fatal)
            .expect_err("terminal error")
            .to_string()
            .contains("fixture stream lost")
    );
    assert!(quit.get());
}

#[test]
fn paused_stream_only_announces_a_concrete_stopped_format() {
    let (state, ready, receiver, stopped) = fixture();
    handle_state_changed(
        pw::stream::StreamState::Paused,
        &state,
        &ready,
        &stopped,
        || Ok(()),
        || {},
    );
    assert!(receiver.try_recv().is_err());
    state.borrow_mut().format = Some(format());
    handle_state_changed(
        pw::stream::StreamState::Paused,
        &state,
        &ready,
        &stopped,
        || Ok(()),
        || {},
    );
    assert!(receiver.try_recv().is_err());
    stopped.set(true);
    handle_state_changed(
        pw::stream::StreamState::Paused,
        &state,
        &ready,
        &stopped,
        || Ok(()),
        || {},
    );
    assert_eq!(
        receiver
            .try_recv()
            .expect("ready format")
            .expect("valid format"),
        format()
    );
}

#[test]
fn streaming_stream_pauses_once_after_format_and_waits_for_paused_state() {
    let (state, ready, receiver, stopped) = fixture();
    let pauses = Cell::new(0);
    let pause = || {
        pauses.set(pauses.get() + 1);
        Ok(())
    };
    handle_state_changed(
        pw::stream::StreamState::Streaming,
        &state,
        &ready,
        &stopped,
        pause,
        || {},
    );
    assert_eq!(pauses.get(), 0);
    state.borrow_mut().format = Some(format());
    handle_state_changed(
        pw::stream::StreamState::Streaming,
        &state,
        &ready,
        &stopped,
        pause,
        || {},
    );
    handle_state_changed(
        pw::stream::StreamState::Streaming,
        &state,
        &ready,
        &stopped,
        pause,
        || {},
    );
    assert_eq!(pauses.get(), 1);
    assert!(receiver.try_recv().is_err());
    handle_state_changed(
        pw::stream::StreamState::Paused,
        &state,
        &ready,
        &stopped,
        || Ok(()),
        || {},
    );
    assert_eq!(
        receiver
            .try_recv()
            .expect("ready format")
            .expect("valid format"),
        format()
    );
}

#[test]
fn streaming_pause_failure_ends_negotiation_with_error() {
    let (state, ready, receiver, stopped) = fixture();
    state.borrow_mut().format = Some(format());
    let quit = Cell::new(false);
    handle_state_changed(
        pw::stream::StreamState::Streaming,
        &state,
        &ready,
        &stopped,
        || Err(pipewire_error("pause failed")),
        || quit.set(true),
    );
    assert!(stopped.get());
    assert!(quit.get());
    assert!(
        receiver
            .try_recv()
            .expect("ready failure")
            .expect_err("error")
            .to_string()
            .contains("pause failed")
    );
}

#[test]
fn nonformat_states_leave_negotiation_unchanged() {
    let (state, ready, receiver, stopped) = fixture();
    for event in [
        pw::stream::StreamState::Unconnected,
        pw::stream::StreamState::Connecting,
    ] {
        handle_state_changed(
            event,
            &state,
            &ready,
            &stopped,
            || panic!("must not pause"),
            || panic!("must not quit"),
        );
    }
    assert!(ready.borrow().is_some());
    assert!(receiver.try_recv().is_err());
}

#[test]
fn null_format_waits_without_clearing_an_existing_format() {
    let (state, ready, receiver, stopped) = fixture();
    state.borrow_mut().format = Some(format());
    handle_format_changed(
        Ok(None),
        pw::stream::StreamState::Paused,
        &state,
        &ready,
        &stopped,
        || panic!("must not pause"),
        || panic!("must not quit"),
    );
    assert_eq!(state.borrow().format, Some(format()));
    assert!(receiver.try_recv().is_err());
}

#[test]
fn format_arriving_after_pause_completes_readiness() {
    let (state, ready, receiver, stopped) = fixture();
    stopped.set(true);
    handle_format_changed(
        Ok(Some(format())),
        pw::stream::StreamState::Paused,
        &state,
        &ready,
        &stopped,
        || panic!("must not pause"),
        || panic!("must not quit"),
    );
    assert_eq!(state.borrow().format, Some(format()));
    assert_eq!(
        receiver.try_recv().expect("format").expect("valid format"),
        format()
    );
}

#[test]
fn format_arriving_while_streaming_pauses_then_announces_on_paused_event() {
    let (state, ready, receiver, stopped) = fixture();
    let paused = Cell::new(0);
    handle_format_changed(
        Ok(Some(format())),
        pw::stream::StreamState::Streaming,
        &state,
        &ready,
        &stopped,
        || {
            paused.set(paused.get() + 1);
            Ok(())
        },
        || {},
    );
    assert_eq!(paused.get(), 1);
    assert!(stopped.get());
    assert!(receiver.try_recv().is_err());
    handle_state_changed(
        pw::stream::StreamState::Paused,
        &state,
        &ready,
        &stopped,
        || Ok(()),
        || {},
    );
    assert_eq!(
        receiver.try_recv().expect("format").expect("valid format"),
        format()
    );
}

#[test]
fn format_pause_failure_reports_error_and_quits() {
    let (state, ready, receiver, stopped) = fixture();
    let quit = Cell::new(false);
    handle_format_changed(
        Ok(Some(format())),
        pw::stream::StreamState::Streaming,
        &state,
        &ready,
        &stopped,
        || Err(pipewire_error("format pause failed")),
        || quit.set(true),
    );
    assert!(quit.get());
    assert!(
        receiver
            .try_recv()
            .expect("error")
            .expect_err("failure")
            .to_string()
            .contains("format pause failed")
    );
}

#[test]
fn invalid_format_reports_fatal_error_without_overwriting_existing_format() {
    let (state, ready, receiver, stopped) = fixture();
    state.borrow_mut().format = Some(format());
    let quit = Cell::new(false);
    handle_format_changed(
        Err(CaptureError::Backend("invalid format".into())),
        pw::stream::StreamState::Paused,
        &state,
        &ready,
        &stopped,
        || panic!("must not pause"),
        || quit.set(true),
    );
    assert_eq!(state.borrow().format, Some(format()));
    assert!(quit.get());
    assert!(receiver.try_recv().expect("error").is_err());
    assert!(
        take_fatal(&state.borrow().fatal)
            .expect_err("fatal")
            .to_string()
            .contains("invalid format")
    );
}
