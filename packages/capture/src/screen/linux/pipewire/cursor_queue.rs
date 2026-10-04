use super::CursorMessage;
use crossbeam_channel::{Sender, TrySendError};
pub(super) fn enqueue_cursor_message(
    sink: &Sender<CursorMessage>,
    pending: &mut Option<CursorMessage>,
    message: CursorMessage,
) -> Result<(), ()> {
    if let Some(previous) = pending.take() {
        match sink.try_send(previous) {
            Ok(()) => {}
            Err(TrySendError::Full(_)) => {
                // The worker is still behind. Keep only the freshest cursor
                // state so the callback remains realtime-safe.
                *pending = Some(message);
                return Ok(());
            }
            Err(TrySendError::Disconnected(_)) => return Err(()),
        }
    }
    match sink.try_send(message) {
        Ok(()) => Ok(()),
        Err(TrySendError::Full(message)) => {
            *pending = Some(message);
            Ok(())
        }
        Err(TrySendError::Disconnected(_)) => Err(()),
    }
}

pub(super) fn flush_cursor_message(
    sink: &Sender<CursorMessage>,
    pending: &mut Option<CursorMessage>,
) -> Result<(), ()> {
    let Some(message) = pending.take() else {
        return Ok(());
    };
    sink.send(message).map_err(|_| ())
}
