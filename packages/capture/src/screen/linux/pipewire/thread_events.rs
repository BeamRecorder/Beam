use super::*;

pub(super) fn handle_stream_state(
    new: pw::stream::StreamState,
    state: &Rc<RefCell<ProcessState>>,
    ready: &ReadySender,
    negotiation_stopped: &Rc<Cell<bool>>,
    pause_stream: impl FnOnce() -> Result<(), CaptureError>,
    quit: impl FnOnce(),
) {
    match new {
        pw::stream::StreamState::Error(message) => {
            set_fatal(&state.borrow().fatal, stream_error(&message));
            send_ready_error(ready, pipewire_error(message));
            quit();
        }
        pw::stream::StreamState::Paused => {
            if negotiation_stopped.get()
                && let Some(format) = state.borrow().negotiated
            {
                send_ready_ok(ready, format);
            }
        }
        pw::stream::StreamState::Streaming => {
            if state.borrow().negotiated.is_some()
                && !negotiation_stopped.replace(true)
                && let Err(error) = pause_stream()
            {
                let diagnostic = error.to_string();
                set_fatal(&state.borrow().fatal, pipewire_error(error));
                send_ready_error(ready, pipewire_error(diagnostic));
                quit();
            }
        }
        _ => {}
    }
}

#[allow(clippy::too_many_arguments)]
pub(super) fn handle_format_event(
    result: Result<Option<NegotiatedFormat>, CaptureError>,
    stream_state: pw::stream::StreamState,
    state: &Rc<RefCell<ProcessState>>,
    ready: &ReadySender,
    negotiation_stopped: &Rc<Cell<bool>>,
    update_params: impl FnOnce(NegotiatedFormat) -> Result<(), CaptureError>,
    pause_stream: impl FnOnce() -> Result<(), CaptureError>,
    quit: impl FnOnce(),
) {
    match result {
        Ok(Some(format)) => {
            state.borrow_mut().negotiated = Some(format);
            if let Err(error) = update_params(format) {
                let diagnostic = error.to_string();
                set_fatal(&state.borrow().fatal, error);
                send_ready_error(ready, format_error(diagnostic));
                quit();
                return;
            }
            if matches!(stream_state, pw::stream::StreamState::Paused) {
                if negotiation_stopped.get() {
                    send_ready_ok(ready, format);
                }
            } else if matches!(stream_state, pw::stream::StreamState::Streaming)
                && !negotiation_stopped.replace(true)
                && let Err(error) = pause_stream()
            {
                let diagnostic = error.to_string();
                set_fatal(&state.borrow().fatal, pipewire_error(error));
                send_ready_error(ready, pipewire_error(diagnostic));
                quit();
            }
        }
        Ok(None) => {
            // A null format clears the previous PipeWire format during negotiation.
        }
        Err(error) => {
            let diagnostic = error.to_string();
            set_fatal(&state.borrow().fatal, error);
            send_ready_error(ready, format_error(diagnostic));
            quit();
        }
    }
}

pub(super) fn handle_command(
    command: PipewireCommand,
    state: &Rc<RefCell<ProcessState>>,
    mut set_active: impl FnMut(bool) -> Result<(), CaptureError>,
    flush: impl FnOnce() -> Result<(), CaptureError>,
    disconnect: impl FnOnce() -> Result<(), CaptureError>,
    quit: impl FnOnce(),
) {
    match command {
        PipewireCommand::Start {
            start_ns,
            start_gate,
            reply,
        } => {
            let mut state = state.borrow_mut();
            state.timestamp = TimestampMapper::new(start_ns);
            state.start_gate = start_gate;
            state.active = true;
            let result = set_active(true);
            if let Err(error) = &result {
                set_fatal(&state.fatal, pipewire_error(error));
            }
            if result.is_ok() {
                state.start_reply = Some(reply);
            } else {
                let _ = reply.send(result);
            }
        }
        PipewireCommand::Pause { reply } => {
            let mut state = state.borrow_mut();
            state.active = false;
            flush_pending_cursor(&mut state);
            let result = set_active(false).and_then(|()| flush());
            if let Err(error) = &result {
                set_fatal(&state.fatal, pipewire_error(error));
            }
            let _ = reply.send(result);
        }
        PipewireCommand::Stop => {
            let mut state = state.borrow_mut();
            state.active = false;
            state.stopping = true;
            flush_pending_cursor(&mut state);
            drop(state);
            let _ = set_active(false);
            let _ = disconnect();
            quit();
        }
    }
}

#[path = "../../../../test/screen/linux/pipewire/thread_events.rs"]
mod thread_event_checks;
