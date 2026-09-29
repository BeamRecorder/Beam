//! Restores temporary desktop changes on normal completion, engine failure or shutdown.

use super::preferences::Preferences;
use beam_media_engine::{RecordingController, RecordingState};
use beam_screen::desktop::appearance::{DesktopAppearance, DesktopOptions};
use std::{sync::mpsc, thread::JoinHandle, time::Duration};

pub(super) fn begin(preferences: &Preferences) -> Result<Option<DesktopAppearance>, String> {
    let preferences: super::preferences::NativePreferences =
        crate::json::decode(preferences.view()?)?;
    if !preferences.hide_taskbar && !preferences.hide_desktop_icons {
        return Ok(None);
    }
    DesktopAppearance::begin(DesktopOptions {
        hide_taskbar: preferences.hide_taskbar,
        hide_desktop_icons: preferences.hide_desktop_icons,
    })
    .map(Some)
    .map_err(|error| error.to_string())
}

pub(super) struct Monitor {
    stop: mpsc::Sender<()>,
    finished: mpsc::Receiver<Result<(), String>>,
    worker: Option<JoinHandle<()>>,
}

impl Monitor {
    pub(super) fn new(
        mut appearance: DesktopAppearance,
        controller: RecordingController,
    ) -> Result<Self, String> {
        let (stop, stopping) = mpsc::channel();
        let (done, finished) = mpsc::channel();
        let worker = std::thread::Builder::new()
            .name("beam-desktop-restore".into())
            .spawn(move || {
                // Poll only during a capture that temporarily changed desktop appearance.
                loop {
                    match stopping.recv_timeout(Duration::from_millis(100)) {
                        Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                    }
                    if terminal(controller.status().state) {
                        break;
                    }
                }
                let _ = done.send(appearance.restore().map_err(|error| error.to_string()));
            })
            .map_err(|error| error.to_string())?;
        Ok(Self {
            stop,
            finished,
            worker: Some(worker),
        })
    }

    pub(super) fn finish(&mut self) -> Result<(), String> {
        let Some(worker) = self.worker.take() else {
            return Ok(());
        };
        let _ = self.stop.send(());
        worker
            .join()
            .map_err(|_| "desktop restoration worker failed".to_owned())?;
        self.finished.recv().map_err(|error| error.to_string())?
    }
}

impl Drop for Monitor {
    fn drop(&mut self) {
        let _ = self.finish();
    }
}

pub(super) fn terminal(state: RecordingState) -> bool {
    matches!(
        state,
        RecordingState::Idle
            | RecordingState::Completed
            | RecordingState::Failed
            | RecordingState::Interrupted
    )
}

pub(super) fn restore(
    monitor: &std::sync::Mutex<Option<Monitor>>,
    status: &mut beam_media_engine::RecordingStatus,
) {
    if let Some(mut monitor) = monitor
        .lock()
        .unwrap_or_else(|poison| poison.into_inner())
        .take()
        && let Err(error) = monitor.finish()
    {
        let previous = status.error.take().unwrap_or_default();
        status.error = Some(if previous.is_empty() {
            error
        } else {
            format!("{previous}; {error}")
        });
    }
}
