use super::*;

pub(super) fn capture_properties(target: Option<&str>) -> pw::properties::PropertiesBox {
    let mut props = properties! {
        *pw::keys::MEDIA_TYPE => "Audio",
        *pw::keys::MEDIA_CATEGORY => "Capture",
        *pw::keys::MEDIA_ROLE => "Music",
        *pw::keys::STREAM_CAPTURE_SINK => "true",
    };
    if let Some(target) = target {
        props.insert(*pw::keys::TARGET_OBJECT, target);
    }
    props
}

pub(super) fn handle_command(
    command: Command,
    state: &Rc<RefCell<ProcessState>>,
    mut set_active: impl FnMut(bool) -> Result<(), AudioError>,
    disconnect: impl FnOnce() -> Result<(), AudioError>,
    quit: impl FnOnce(),
) {
    match command {
        Command::Start => {
            state.borrow_mut().active = true;
            if let Err(error) = set_active(true) {
                let _ = state
                    .borrow()
                    .terminal_tx
                    .try_send(AudioEvent::Failed(error.to_string()));
                quit();
            }
        }
        Command::Stop => {
            state.borrow_mut().active = false;
            let _ = set_active(false);
            let _ = disconnect();
            quit();
        }
    }
}

pub(super) fn handle_stream_state(
    new: pw::stream::StreamState,
    state: &Rc<RefCell<ProcessState>>,
    ready: &ReadySender,
    quit: impl FnOnce(),
) {
    match new {
        pw::stream::StreamState::Error(message) => {
            report_listener_failure(state, ready, message);
            quit();
        }
        pw::stream::StreamState::Streaming => {
            let _ = state.borrow().event_tx.try_send(AudioEvent::Started);
        }
        _ => {}
    }
}

pub(super) fn handle_format_result(
    parsed: Result<NegotiatedFormat, AudioError>,
    state: &Rc<RefCell<ProcessState>>,
    ready: &ReadySender,
    update_header: impl FnOnce() -> Result<(), AudioError>,
    quit: impl FnOnce(),
) {
    match parsed {
        Ok(format) => {
            if let Err(error) = update_header() {
                report_listener_failure(state, ready, error.to_string());
                quit();
                return;
            }
            if !accept_negotiated_format(state, ready, format) {
                quit();
            }
        }
        Err(error) => {
            report_listener_failure(state, ready, error.to_string());
            quit();
        }
    }
}

#[path = "../../test/linux/handlers.rs"]
mod handler_checks;
