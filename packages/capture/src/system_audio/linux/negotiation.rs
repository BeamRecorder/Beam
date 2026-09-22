use super::*;

pub(super) fn handle_state_changed(
    new: pw::stream::StreamState,
    state: &Rc<RefCell<ProcessState>>,
    ready: &ReadySender,
    stopped: &Rc<Cell<bool>>,
    pause_stream: impl FnOnce() -> Result<(), CaptureError>,
    quit: impl FnOnce(),
) {
    match new {
        pw::stream::StreamState::Error(message) => {
            send_ready(ready, Err(pipewire_error(message.clone())));
            set_fatal(&state.borrow().fatal, pipewire_error(message));
            quit();
        }
        pw::stream::StreamState::Paused if stopped.get() => {
            if let Some(format) = state.borrow().format {
                send_ready(ready, Ok(format));
            }
        }
        pw::stream::StreamState::Streaming => {
            if state.borrow().format.is_some()
                && !stopped.replace(true)
                && let Err(error) = pause_stream()
            {
                send_ready(ready, Err(error));
                quit();
            }
        }
        _ => {}
    }
}

pub(super) fn handle_format_changed(
    result: Result<Option<SystemAudioFormat>, CaptureError>,
    stream_state: pw::stream::StreamState,
    state: &Rc<RefCell<ProcessState>>,
    ready: &ReadySender,
    stopped: &Rc<Cell<bool>>,
    pause_stream: impl FnOnce() -> Result<(), CaptureError>,
    quit: impl FnOnce(),
) {
    match result {
        Ok(Some(format)) => {
            state.borrow_mut().format = Some(format);
            if matches!(stream_state, pw::stream::StreamState::Paused) && stopped.get() {
                send_ready(ready, Ok(format));
            } else if matches!(stream_state, pw::stream::StreamState::Streaming)
                && !stopped.replace(true)
                && let Err(error) = pause_stream()
            {
                send_ready(ready, Err(error));
                quit();
            }
        }
        Ok(None) => {
            // PipeWire can clear the format during negotiation. Wait for a concrete one.
        }
        Err(error) => {
            send_ready(ready, Err(pipewire_error(error.to_string())));
            set_fatal(&state.borrow().fatal, error);
            quit();
        }
    }
}

#[path = "../../../test/system_audio/linux/negotiation.rs"]
mod negotiation_checks;
