use crate::{
    CameraPreview, EngineError, NativeSources, RecordingConfig, RecordingEvents, RecordingStatus,
    SessionId, backend,
    events::EventLog,
    output,
    worker::{Command, Worker},
};
use std::{
    path::Path,
    sync::{Arc, Mutex, mpsc},
    thread::{self, JoinHandle},
};

struct Owner {
    root: std::path::PathBuf,
    commands: mpsc::SyncSender<Command>,
    thread: Mutex<Option<JoinHandle<()>>>,
    events: Arc<EventLog>,
}

impl Drop for Owner {
    fn drop(&mut self) {
        let _ = self.commands.send(Command::Shutdown);
        if let Some(thread) = self
            .thread
            .get_mut()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take()
        {
            let _ = thread.join();
        }
    }
}

/// Clones address the same worker and the same exclusive recording session.
/// Commands are synchronous: call them from the host's task executor, not its
/// drawing callback. Dropping the last handle interrupts and finalizes capture.
#[derive(Clone)]
pub struct RecordingController {
    owner: Arc<Owner>,
}

impl RecordingController {
    pub fn new(projects_root: impl AsRef<Path>) -> Result<Self, EngineError> {
        Self::with_prepare(projects_root.as_ref(), backend::prepare)
    }

    pub(crate) fn with_prepare(
        root: &Path,
        prepare: backend::Prepare,
    ) -> Result<Self, EngineError> {
        let root = output::root(root)?;
        let (commands, incoming) = mpsc::sync_channel(16);
        let events = Arc::new(EventLog::new());
        let worker = Worker::new(root.clone(), events.clone(), prepare);
        let thread = thread::Builder::new()
            .name("beam-media-engine".into())
            .spawn(move || worker.run(incoming))?;
        Ok(Self {
            owner: Arc::new(Owner {
                root,
                commands,
                thread: Mutex::new(Some(thread)),
                events,
            }),
        })
    }

    pub fn list_sources(&self) -> NativeSources {
        NativeSources {
            screens: beam_screen::list_sources().map_err(|error| error.to_string()),
            cameras: beam_camera::list_cameras().map_err(|error| error.to_string()),
            microphones: beam_audio::list_inputs().map_err(|error| error.to_string()),
            system_outputs: beam_audio::list_system_outputs().map_err(|error| error.to_string()),
        }
    }

    pub fn capabilities(&self) -> Result<crate::MediaCapabilities, EngineError> {
        Ok(crate::MediaCapabilities {
            screen: beam_screen::capabilities().map_err(backend::screen_error)?,
            camera_capture: true,
            microphone_capture: true,
            system_audio_capture: true,
            pause_resume: true,
            screenshots: true,
        })
    }
    pub fn permissions(&self) -> crate::MediaPermissions {
        crate::MediaPermissions {
            screen: beam_screen::permissions(),
            camera: beam_media_manifest::PermissionState::Unknown,
            microphone: beam_media_manifest::PermissionState::Unknown,
            system_audio: beam_media_manifest::PermissionState::Unknown,
        }
    }
    pub fn audio_levels(
        &self,
        id: SessionId,
    ) -> Result<beam_media_session::AudioLevels, EngineError> {
        self.request(|reply| Command::Levels(id, reply))
    }
    pub fn capture_still(
        &self,
        config: crate::StillConfig,
    ) -> Result<crate::StillResult, EngineError> {
        if let Some(region) = config.region {
            region
                .validate()
                .map_err(|error| EngineError::InvalidConfiguration(error.to_string()))?;
        }
        let directory = output::reserve(&self.owner.root, config.project_id)?;
        let output = directory.join("screenshot.png");
        let result = beam_screen::screenshot::capture(beam_screen::screenshot::ScreenshotRequest {
            screen: config.screen,
            region: config.region,
            output: output.clone(),
            excluded_window_handles: config.excluded_window_handles,
        });
        let result = match result {
            Ok(result) => result,
            Err(error) => {
                std::fs::remove_dir_all(&directory)?;
                return Err(backend::screen_error(error));
            }
        };
        Ok(crate::StillResult {
            project_id: config.project_id,
            path: output,
            width: result.width,
            height: result.height,
        })
    }
    pub fn source_preview(
        &self,
        id: &str,
        width: u32,
        height: u32,
    ) -> Result<beam_screen::screen::SourcePreview, EngineError> {
        let id = beam_screen::model::SourceId::new(id)
            .map_err(|error| EngineError::InvalidConfiguration(error.to_string()))?;
        beam_screen::screen::capture_source_preview(&id, width, height)
            .map_err(backend::screen_error)
    }
    pub fn prepare(&self, config: RecordingConfig) -> Result<RecordingStatus, EngineError> {
        output::validate(&config)?;
        self.request(|reply| Command::Prepare(config, reply))
    }

    pub fn start(&self, id: SessionId) -> Result<RecordingStatus, EngineError> {
        self.request(|reply| Command::Start(id, reply))
    }

    pub fn pause(&self, id: SessionId) -> Result<RecordingStatus, EngineError> {
        self.request(|reply| Command::Pause(id, reply))
    }
    pub fn resume(&self, id: SessionId) -> Result<RecordingStatus, EngineError> {
        self.request(|reply| Command::Resume(id, reply))
    }

    /// Erases the active take and starts a fresh session with the same sources.
    pub fn restart(&self, id: SessionId) -> Result<RecordingStatus, EngineError> {
        self.request(|reply| Command::Restart(id, reply))
    }

    pub fn stop(&self, id: SessionId) -> Result<RecordingStatus, EngineError> {
        self.request(|reply| Command::Finish(id, None, reply))
    }

    /// Cancel retains recoverable files and returns an Interrupted manifest.
    pub fn cancel(&self, id: SessionId) -> Result<RecordingStatus, EngineError> {
        self.request(|reply| Command::Finish(id, Some("cancelled by host"), reply))
    }

    /// Nonblocking snapshot, also readable during preparation/finalization.
    pub fn status(&self) -> RecordingStatus {
        self.owner.events.read(u64::MAX).status
    }

    pub fn events(&self, after_sequence: u64) -> RecordingEvents {
        self.owner.events.read(after_sequence)
    }

    pub fn screen_preview(
        &self,
        id: SessionId,
    ) -> Result<Option<beam_screen::ScreenPreview>, EngineError> {
        self.request(|reply| Command::ScreenPreview(id, reply))
    }

    pub fn camera_preview(&self, id: SessionId) -> Result<Option<CameraPreview>, EngineError> {
        self.request(|reply| Command::Preview(id, reply))
    }

    fn request<T>(
        &self,
        command: impl FnOnce(mpsc::SyncSender<Result<T, EngineError>>) -> Command,
    ) -> Result<T, EngineError> {
        let (reply, response) = mpsc::sync_channel(1);
        self.owner
            .commands
            .try_send(command(reply))
            .map_err(|error| match error {
                mpsc::TrySendError::Full(_) => EngineError::Busy,
                mpsc::TrySendError::Disconnected(_) => EngineError::WorkerUnavailable,
            })?;
        response
            .recv()
            .map_err(|_| EngineError::WorkerUnavailable)?
    }
}

#[path = "../test/controller.rs"]
mod controller_checks;
