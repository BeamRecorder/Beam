#![cfg(test)]
#![allow(clippy::expect_used)]

use std::cell::Cell;

use super::*;

struct Fixture {
    state: Rc<RefCell<ProcessState>>,
    ready: ReadySender,
    ready_rx: mpsc::Receiver<Result<NegotiatedFormat, AudioError>>,
    events: Receiver<AudioEvent>,
    terminal: Receiver<AudioEvent>,
}

fn fixture() -> Fixture {
    let (packet_tx, _) = crossbeam_channel::bounded(1);
    let (event_tx, events) = crossbeam_channel::bounded(1);
    let (terminal_tx, terminal) = crossbeam_channel::bounded(1);
    let (ready_tx, ready_rx) = mpsc::sync_channel(1);
    Fixture {
        state: Rc::new(RefCell::new(ProcessState {
            format: None,
            clock: SessionClock::start(),
            gate: Arc::new(StartGate::new()),
            sample_clock: None,
            next_sample: 0,
            active: false,
            packet_tx,
            event_tx,
            terminal_tx,
            queued_bytes: Arc::new(AtomicUsize::new(0)),
            byte_limit: 8,
            last_native_timestamp_ns: None,
            native_timestamps_invalidated: false,
        })),
        ready: Rc::new(RefCell::new(Some(ready_tx))),
        ready_rx,
        events,
        terminal,
    }
}

fn stereo() -> NegotiatedFormat {
    NegotiatedFormat {
        sample_rate: 48_000,
        channels: 2,
    }
}

#[test]
fn capture_properties_set_capture_role_and_optional_target() {
    let automatic = capture_properties(None);
    assert_eq!(automatic.get(*pw::keys::MEDIA_TYPE), Some("Audio"));
    assert_eq!(automatic.get(*pw::keys::MEDIA_CATEGORY), Some("Capture"));
    assert_eq!(automatic.get(*pw::keys::MEDIA_ROLE), Some("Music"));
    assert_eq!(automatic.get(*pw::keys::STREAM_CAPTURE_SINK), Some("true"));
    assert_eq!(automatic.get(*pw::keys::TARGET_OBJECT), None);

    let selected = capture_properties(Some("alsa_output.test"));
    assert_eq!(
        selected.get(*pw::keys::TARGET_OBJECT),
        Some("alsa_output.test")
    );
    assert_eq!(selected.get(*pw::keys::STREAM_CAPTURE_SINK), Some("true"));
}

#[test]
fn start_command_activates_stream_without_disconnect_or_quit() {
    let fixture = fixture();
    let activated = Cell::new(false);
    let disconnected = Cell::new(false);
    let quit = Cell::new(false);
    handle_command(
        Command::Start,
        &fixture.state,
        |active| {
            activated.set(active);
            Ok(())
        },
        || {
            disconnected.set(true);
            Ok(())
        },
        || quit.set(true),
    );
    assert!(fixture.state.borrow().active);
    assert!(activated.get());
    assert!(!disconnected.get());
    assert!(!quit.get());
    assert!(fixture.terminal.is_empty());
}

#[test]
fn start_failure_reports_terminal_error_and_quits_even_when_channel_is_full_or_closed() {
    for channel in ["open", "full", "closed"] {
        let fixture = fixture();
        if channel == "full" {
            fixture
                .state
                .borrow()
                .terminal_tx
                .try_send(AudioEvent::DeviceChanged("earlier event".into()))
                .expect("fill terminal queue");
        }
        let Fixture {
            state, terminal, ..
        } = fixture;
        let mut terminal = Some(terminal);
        if channel == "closed" {
            drop(terminal.take());
        }
        let quit = Cell::new(0);
        let disconnected = Cell::new(false);
        handle_command(
            Command::Start,
            &state,
            |active| {
                assert!(active);
                Err(AudioError::Backend("activation failed".into()))
            },
            || {
                disconnected.set(true);
                Ok(())
            },
            || quit.set(quit.get() + 1),
        );
        assert!(state.borrow().active);
        assert_eq!(quit.get(), 1);
        assert!(!disconnected.get());
        if channel == "open" {
            assert!(
                matches!(terminal.as_ref().expect("open terminal").try_recv(), Ok(AudioEvent::Failed(reason)) if reason.contains("activation failed"))
            );
        } else if channel == "full" {
            assert!(
                matches!(terminal.as_ref().expect("full terminal").try_recv(), Ok(AudioEvent::DeviceChanged(reason)) if reason == "earlier event")
            );
            assert!(terminal.as_ref().expect("full terminal").is_empty());
        }
    }
}

#[test]
fn stop_deactivates_disconnects_and_quits_even_when_both_calls_fail() {
    for fail in [false, true] {
        let fixture = fixture();
        fixture.state.borrow_mut().active = true;
        let order = RefCell::new(Vec::new());
        handle_command(
            Command::Stop,
            &fixture.state,
            |active| {
                order.borrow_mut().push("deactivate");
                assert!(!active);
                if fail {
                    Err(AudioError::Backend("deactivate failed".into()))
                } else {
                    Ok(())
                }
            },
            || {
                order.borrow_mut().push("disconnect");
                if fail {
                    Err(AudioError::Backend("disconnect failed".into()))
                } else {
                    Ok(())
                }
            },
            || order.borrow_mut().push("quit"),
        );
        assert!(!fixture.state.borrow().active);
        assert_eq!(*order.borrow(), ["deactivate", "disconnect", "quit"]);
        assert!(fixture.terminal.is_empty());
    }
}

#[test]
fn stream_error_reports_ready_and_terminal_then_quits_once() {
    let fixture = fixture();
    let quits = Cell::new(0);
    handle_stream_state(
        pw::stream::StreamState::Error("stream disconnected".into()),
        &fixture.state,
        &fixture.ready,
        || quits.set(quits.get() + 1),
    );
    assert_eq!(quits.get(), 1);
    assert!(
        matches!(fixture.ready_rx.try_recv(), Ok(Err(AudioError::Backend(reason))) if reason == "stream disconnected")
    );
    assert!(
        matches!(fixture.terminal.try_recv(), Ok(AudioEvent::Failed(reason)) if reason == "stream disconnected")
    );
    assert!(fixture.ready.borrow().is_none());
}

#[test]
fn stream_error_after_ready_is_closed_keeps_existing_terminal_event() {
    let fixture = fixture();
    fixture
        .state
        .borrow()
        .terminal_tx
        .try_send(AudioEvent::DeviceChanged("removed".into()))
        .expect("fill terminal channel");
    fixture.ready.borrow_mut().take();
    let quit = Cell::new(false);
    handle_stream_state(
        pw::stream::StreamState::Error("late error".into()),
        &fixture.state,
        &fixture.ready,
        || quit.set(true),
    );
    assert!(quit.get());
    assert!(
        matches!(fixture.terminal.try_recv(), Ok(AudioEvent::DeviceChanged(reason)) if reason == "removed")
    );
    assert!(fixture.terminal.is_empty());
    assert!(fixture.ready_rx.try_recv().is_err());
}

#[test]
fn streaming_emits_started_when_open_and_drops_it_when_full_or_closed() {
    for channel in ["open", "full", "closed"] {
        let fixture = fixture();
        if channel == "full" {
            fixture
                .state
                .borrow()
                .event_tx
                .try_send(AudioEvent::Dropped {
                    first_sample: 7,
                    frames: 1,
                })
                .expect("fill event queue");
        }
        let Fixture {
            state,
            events,
            ready,
            ..
        } = fixture;
        let mut events = Some(events);
        if channel == "closed" {
            drop(events.take());
        }
        let quit = Cell::new(false);
        handle_stream_state(pw::stream::StreamState::Streaming, &state, &ready, || {
            quit.set(true)
        });
        assert!(!quit.get());
        if channel == "open" {
            assert!(matches!(
                events.as_ref().expect("open events").try_recv(),
                Ok(AudioEvent::Started)
            ));
        } else if channel == "full" {
            assert!(matches!(
                events.as_ref().expect("full events").try_recv(),
                Ok(AudioEvent::Dropped {
                    first_sample: 7,
                    frames: 1
                })
            ));
            assert!(events.as_ref().expect("full events").is_empty());
        }
    }
}

#[test]
fn non_streaming_non_error_states_leave_channels_and_state_untouched() {
    for status in [
        pw::stream::StreamState::Paused,
        pw::stream::StreamState::Connecting,
        pw::stream::StreamState::Unconnected,
    ] {
        let fixture = fixture();
        let quit = Cell::new(false);
        handle_stream_state(status, &fixture.state, &fixture.ready, || quit.set(true));
        assert!(!quit.get());
        assert!(!fixture.state.borrow().active);
        assert!(fixture.state.borrow().format.is_none());
        assert!(fixture.ready.borrow().is_some());
        assert!(fixture.events.is_empty());
        assert!(fixture.terminal.is_empty());
    }
}

#[test]
fn format_initial_and_identical_renegotiation_update_header_each_time() {
    let fixture = fixture();
    let updates = Cell::new(0);
    let quits = Cell::new(0);
    for _ in 0..2 {
        handle_format_result(
            Ok(stereo()),
            &fixture.state,
            &fixture.ready,
            || {
                updates.set(updates.get() + 1);
                Ok(())
            },
            || quits.set(quits.get() + 1),
        );
    }
    assert_eq!(updates.get(), 2);
    assert_eq!(quits.get(), 0);
    assert_eq!(fixture.state.borrow().format, Some(stereo()));
    assert!(matches!(fixture.ready_rx.try_recv(), Ok(Ok(format)) if format == stereo()));
    assert!(fixture.ready_rx.try_recv().is_err());
    assert!(fixture.terminal.is_empty());
}

#[test]
fn changed_format_reports_terminal_event_and_quits_after_metadata_update() {
    let fixture = fixture();
    fixture.state.borrow_mut().format = Some(stereo());
    let updated = Cell::new(false);
    let quit = Cell::new(false);
    handle_format_result(
        Ok(NegotiatedFormat {
            sample_rate: 44_100,
            channels: 1,
        }),
        &fixture.state,
        &fixture.ready,
        || {
            updated.set(true);
            Ok(())
        },
        || quit.set(true),
    );
    assert!(updated.get());
    assert!(quit.get());
    assert_eq!(fixture.state.borrow().format, Some(stereo()));
    assert!(matches!(
        fixture.terminal.try_recv(),
        Ok(AudioEvent::DeviceChanged(_))
    ));
    assert!(fixture.ready.borrow().is_some());
    assert!(matches!(
        fixture.ready_rx.try_recv(),
        Err(mpsc::TryRecvError::Empty)
    ));
}

#[test]
fn header_update_failure_reports_ready_and_terminal_without_accepting_format() {
    let fixture = fixture();
    let quit = Cell::new(false);
    handle_format_result(
        Ok(stereo()),
        &fixture.state,
        &fixture.ready,
        || Err(AudioError::Backend("metadata rejected".into())),
        || quit.set(true),
    );
    assert!(quit.get());
    assert!(fixture.state.borrow().format.is_none());
    assert!(
        matches!(fixture.ready_rx.try_recv(), Ok(Err(AudioError::Backend(reason))) if reason.contains("metadata rejected"))
    );
    assert!(
        matches!(fixture.terminal.try_recv(), Ok(AudioEvent::Failed(reason)) if reason.contains("metadata rejected"))
    );
}

#[test]
fn parse_failure_skips_metadata_update_and_reports_failure() {
    let fixture = fixture();
    let updated = Cell::new(false);
    let quit = Cell::new(false);
    handle_format_result(
        Err(AudioError::Unsupported("unsupported sample format".into())),
        &fixture.state,
        &fixture.ready,
        || {
            updated.set(true);
            Ok(())
        },
        || quit.set(true),
    );
    assert!(!updated.get());
    assert!(quit.get());
    assert!(fixture.state.borrow().format.is_none());
    assert!(
        matches!(fixture.ready_rx.try_recv(), Ok(Err(AudioError::Backend(reason))) if reason.contains("unsupported sample format"))
    );
    assert!(
        matches!(fixture.terminal.try_recv(), Ok(AudioEvent::Failed(reason)) if reason.contains("unsupported sample format"))
    );
}

#[test]
fn disconnected_ready_receiver_does_not_block_valid_format_or_stream_error() {
    let fixture = fixture();
    let Fixture {
        state,
        ready,
        ready_rx,
        terminal,
        ..
    } = fixture;
    drop(ready_rx);
    let quit = Cell::new(false);
    handle_format_result(Ok(stereo()), &state, &ready, || Ok(()), || quit.set(true));
    assert!(!quit.get());
    assert_eq!(state.borrow().format, Some(stereo()));
    assert!(ready.borrow().is_none());
    handle_stream_state(
        pw::stream::StreamState::Error("late stream error".into()),
        &state,
        &ready,
        || quit.set(true),
    );
    assert!(quit.get());
    assert!(
        matches!(terminal.try_recv(), Ok(AudioEvent::Failed(reason)) if reason == "late stream error")
    );
}
