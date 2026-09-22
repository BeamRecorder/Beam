use crossbeam_channel::{Receiver, Sender};

use crate::{CameraError, CameraEvent};

pub(crate) struct CameraEventQueue {
    regular: Receiver<CameraEvent>,
    terminal: Receiver<CameraEvent>,
}

impl CameraEventQueue {
    pub(crate) fn new() -> (Self, Sender<CameraEvent>, Sender<CameraEvent>) {
        let (regular_tx, regular) = crossbeam_channel::bounded(64);
        let (terminal_tx, terminal) = crossbeam_channel::bounded(1);
        (Self { regular, terminal }, regular_tx, terminal_tx)
    }

    pub(crate) fn try_event(&self) -> Option<CameraEvent> {
        self.terminal
            .try_recv()
            .ok()
            .or_else(|| self.regular.try_recv().ok())
    }
}

pub(crate) fn terminal_camera_event(error: &CameraError) -> CameraEvent {
    match error {
        CameraError::DeviceUnavailable(_) => CameraEvent::Disconnected(error.to_string()),
        _ => CameraEvent::Failed(error.to_string()),
    }
}

#[path = "../test/events.rs"]
mod event_checks;
