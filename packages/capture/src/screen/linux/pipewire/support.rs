use std::{
    cell::RefCell,
    rc::Rc,
    sync::mpsc,
    sync::{Arc, Mutex},
    thread::JoinHandle,
};

use crossbeam_channel::Receiver;

use crate::{CaptureError, NativeCaptureErrorCode, screen::ScreenSampleSink};

use super::SinkMessage;

pub(super) type ReadySender = Rc<RefCell<Option<mpsc::SyncSender<Result<(), CaptureError>>>>>;

pub(super) fn sink_worker(
    mut sink: Box<dyn ScreenSampleSink>,
    receiver: Receiver<SinkMessage>,
    fatal: Arc<Mutex<Option<CaptureError>>>,
) -> Result<(), CaptureError> {
    let mut first_error = None;
    for message in receiver {
        let result = match message {
            SinkMessage::Format(format) => sink.format_changed(format),
            SinkMessage::Sample(sample) => sink.push(sample),
            SinkMessage::Discontinuity(event) => sink.discontinuity(event),
            SinkMessage::Finish => {
                let finish = sink.finish();
                if first_error.is_none() {
                    first_error = finish.err();
                }
                break;
            }
        };
        if first_error.is_none() {
            first_error = result.err();
            if let Some(error) = first_error.take() {
                set_fatal(&fatal, sink_error(error.to_string()));
                first_error = Some(error);
            }
        }
    }
    first_error.map_or(Ok(()), Err)
}

pub(super) fn send_ready_ok(ready: &ReadySender) {
    if let Some(sender) = ready.borrow_mut().take() {
        let _ = sender.send(Ok(()));
    }
}

pub(super) fn send_ready_error(ready: &ReadySender, error: CaptureError) {
    if let Some(sender) = ready.borrow_mut().take() {
        let _ = sender.send(Err(error));
    }
}

pub(super) fn set_fatal(slot: &Arc<Mutex<Option<CaptureError>>>, error: CaptureError) {
    if let Ok(mut slot) = slot.lock()
        && slot.is_none()
    {
        *slot = Some(error);
    }
}

pub(super) fn has_fatal(slot: &Arc<Mutex<Option<CaptureError>>>) -> bool {
    slot.lock().map_or(true, |slot| slot.is_some())
}

pub(super) fn take_fatal(slot: &Arc<Mutex<Option<CaptureError>>>) -> Result<(), CaptureError> {
    let mut slot = slot
        .lock()
        .map_err(|_| sink_error("screen capture error lock was poisoned"))?;
    slot.take().map_or(Ok(()), Err)
}

pub(super) fn join(
    thread: &mut Option<JoinHandle<Result<(), CaptureError>>>,
    name: &str,
) -> Result<Result<(), CaptureError>, CaptureError> {
    thread.take().map_or(Ok(Ok(())), |thread| {
        thread
            .join()
            .map_err(|_| pipewire_error(format!("{name} worker panicked")))
    })
}

pub(super) fn pipewire_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::native(
        NativeCaptureErrorCode::PipewireConnectFailed,
        error.to_string(),
    )
}

pub(super) fn stream_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::native(
        NativeCaptureErrorCode::PipewireStreamDisconnected,
        error.to_string(),
    )
}

pub(super) fn format_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::native(
        NativeCaptureErrorCode::PipewireFormatUnsupported,
        error.to_string(),
    )
}

pub(super) fn sink_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::native(NativeCaptureErrorCode::ScreenSinkFailed, error.to_string())
}
