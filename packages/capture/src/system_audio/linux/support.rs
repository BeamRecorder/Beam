use std::{
    sync::{Mutex, mpsc},
    thread::JoinHandle,
};

use crate::{CaptureError, NativeCaptureErrorCode};

use super::SystemAudioFormat;

pub(super) fn send_ready(
    ready: &std::rc::Rc<
        std::cell::RefCell<Option<mpsc::SyncSender<Result<SystemAudioFormat, CaptureError>>>>,
    >,
    result: Result<SystemAudioFormat, CaptureError>,
) {
    if let Some(ready) = ready.borrow_mut().take() {
        let _ = ready.send(result);
    }
}

pub(super) fn set_fatal(fatal: &Mutex<Option<CaptureError>>, error: CaptureError) {
    if let Ok(mut fatal) = fatal.lock() {
        fatal.get_or_insert(error);
    }
}

pub(super) fn take_fatal(fatal: &Mutex<Option<CaptureError>>) -> Result<(), CaptureError> {
    fatal
        .lock()
        .map_err(|_| CaptureError::Backend("system audio failure lock was poisoned".into()))?
        .take()
        .map_or(Ok(()), Err)
}

pub(super) fn join(
    thread: &mut Option<JoinHandle<Result<(), CaptureError>>>,
    name: &str,
) -> Result<Result<(), CaptureError>, CaptureError> {
    thread.take().map_or(Ok(Ok(())), |thread| {
        thread
            .join()
            .map_err(|_| CaptureError::Backend(format!("{name} thread panicked")))
    })
}

pub(super) fn pipewire_error(error: impl ToString) -> CaptureError {
    CaptureError::native(
        NativeCaptureErrorCode::PipewireConnectFailed,
        error.to_string(),
    )
}
