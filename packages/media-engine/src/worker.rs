use crate::{
    CameraPreview, EngineError, RecordingConfig, RecordingState, RecordingStatus,
    backend::{Prepare, Session},
    events::EventLog,
    output,
};
use beam_media_manifest::{SessionId, TrackKind, TrackStatus};
use std::{
    path::PathBuf,
    sync::{Arc, mpsc},
    time::Duration,
};

type Reply<T> = mpsc::SyncSender<Result<T, EngineError>>;
pub(crate) enum Command {
    Prepare(RecordingConfig, Reply<RecordingStatus>),
    Start(SessionId, Reply<RecordingStatus>),
    Pause(SessionId, Reply<RecordingStatus>),
    Resume(SessionId, Reply<RecordingStatus>),
    Restart(SessionId, Reply<RecordingStatus>),
    Finish(SessionId, Option<&'static str>, Reply<RecordingStatus>),
    ScreenPreview(SessionId, Reply<Option<beam_screen::ScreenPreview>>),
    Preview(SessionId, Reply<Option<CameraPreview>>),
    Levels(SessionId, Reply<beam_media_session::AudioLevels>),
    Shutdown,
}

pub(crate) struct Worker {
    root: PathBuf,
    events: Arc<EventLog>,
    prepare: Prepare,
    session: Option<Box<dyn Session>>,
    status: RecordingStatus,
    configuration: Option<RecordingConfig>,
    output: Option<PathBuf>,
}

impl Worker {
    pub(crate) fn new(root: PathBuf, events: Arc<EventLog>, prepare: Prepare) -> Self {
        let status = events.read(0).status;
        Self {
            root,
            events,
            prepare,
            session: None,
            status,
            configuration: None,
            output: None,
        }
    }

    pub(crate) fn run(mut self, incoming: mpsc::Receiver<Command>) {
        let result =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| self.run_loop(incoming)));
        if result.is_err() {
            self.fail("native media worker panicked".into());
        }
    }

    fn run_loop(&mut self, incoming: mpsc::Receiver<Command>) {
        loop {
            if matches!(
                self.status.state,
                RecordingState::Recording | RecordingState::Paused
            ) {
                let result = self
                    .session
                    .as_mut()
                    .ok_or(EngineError::WorkerUnavailable)
                    .and_then(|session| session.poll());
                if let Err(error) = result {
                    self.fail(error.to_string());
                } else if self.session.as_ref().is_some_and(|session| {
                    !session.manifest().tracks.iter().any(|track| {
                        track.kind != TrackKind::Cursor
                            && matches!(track.status, TrackStatus::Recording | TrackStatus::Paused)
                    })
                }) {
                    self.fail("all recording sources have stopped".into());
                } else {
                    self.publish();
                }
            }
            let command = if matches!(
                self.status.state,
                RecordingState::Recording | RecordingState::Paused
            ) {
                match incoming.recv_timeout(Duration::from_millis(5)) {
                    Ok(command) => command,
                    Err(mpsc::RecvTimeoutError::Timeout) => continue,
                    Err(mpsc::RecvTimeoutError::Disconnected) => Command::Shutdown,
                }
            } else {
                incoming.recv().unwrap_or(Command::Shutdown)
            };
            match command {
                Command::Prepare(config, reply) => {
                    let _ = reply.send(self.prepare(config));
                }
                Command::Pause(id, reply) => {
                    let result = self.pause_resume(id, false);
                    let _ = reply.send(result);
                }
                Command::Resume(id, reply) => {
                    let result = self.pause_resume(id, true);
                    let _ = reply.send(result);
                }
                Command::Start(id, reply) => {
                    let _ = reply.send(self.start(id));
                }
                Command::Restart(id, reply) => {
                    let _ = reply.send(self.restart(id));
                }
                Command::Finish(id, reason, reply) => {
                    let _ = reply.send(self.finish(id, reason));
                }
                Command::ScreenPreview(id, reply) => {
                    let result = self.check_id(id).map(|()| {
                        self.session
                            .as_ref()
                            .and_then(|session| session.screen_preview())
                    });
                    let _ = reply.send(result);
                }
                Command::Preview(id, reply) => {
                    let result = self
                        .check_id(id)
                        .map(|()| self.session.as_ref().and_then(|session| session.preview()));
                    let _ = reply.send(result);
                }
                Command::Levels(id, reply) => {
                    let result = self.check_id(id).map(|()| {
                        self.session
                            .as_ref()
                            .map_or_else(Default::default, |session| session.audio_levels())
                    });
                    let _ = reply.send(result);
                }
                Command::Shutdown => {
                    if self.session.is_some() {
                        self.finalize(Some("host closed"));
                    }
                    break;
                }
            }
        }
    }

    fn publish(&mut self) {
        if let Some(session) = &self.session {
            self.status.manifest = Some(session.manifest().clone());
            self.status.session_id = Some(session.manifest().session_id);
        }
        self.events.publish(self.status.clone());
    }

    fn transition_error(&self, operation: &'static str) -> EngineError {
        EngineError::InvalidTransition {
            state: self.status.state,
            operation,
        }
    }

    fn check_id(&self, id: SessionId) -> Result<(), EngineError> {
        if self.status.session_id != Some(id) {
            return Err(EngineError::StaleSession);
        }
        Ok(())
    }

    fn prepare(&mut self, config: RecordingConfig) -> Result<RecordingStatus, EngineError> {
        if self.session.is_some() {
            return Err(self.transition_error("prepare"));
        }
        output::validate(&config)?;
        let root = match config.output {
            crate::OutputLocation::ProjectRoot => self.root.clone(),
            crate::OutputLocation::Studio => output::managed_root(&self.root, "studio")?,
            crate::OutputLocation::Instant => output::managed_root(&self.root, "instant")?,
        };
        let output = output::reserve(&root, config.project_id)?;
        self.configuration = Some(config.clone());
        self.output = Some(output.clone());
        self.status = RecordingStatus {
            state: RecordingState::Preparing,
            session_id: None,
            manifest_path: Some(output.join("manifest.json")),
            manifest: None,
            error: None,
        };
        self.publish();
        match (self.prepare)(config, output.clone()) {
            Ok(session) => {
                self.session = Some(session);
                if let Some(session) = &self.session
                    && let Err(error) = crate::project::register(&output, session.manifest())
                {
                    self.fail(error.to_string());
                    return Err(error);
                }
                self.status.state = RecordingState::Armed;
                self.publish();
                Ok(self.status.clone())
            }
            Err(error) => {
                if matches!(error, EngineError::Cancelled) {
                    // This directory was reserved exclusively by this prepare call.
                    std::fs::remove_dir_all(&output)?;
                }
                self.fail(error.to_string());
                Err(error)
            }
        }
    }

    fn start(&mut self, id: SessionId) -> Result<RecordingStatus, EngineError> {
        self.check_id(id)?;
        if self.status.state != RecordingState::Armed {
            return Err(self.transition_error("start"));
        }
        let session = self
            .session
            .as_mut()
            .ok_or(EngineError::WorkerUnavailable)?;
        if !session
            .manifest()
            .tracks
            .iter()
            .any(|track| track.kind != TrackKind::Cursor && track.status == TrackStatus::Preparing)
        {
            let error = EngineError::Media("no prepared track is available".into());
            self.fail(error.to_string());
            return Err(error);
        }
        if let Err(error) = session.start() {
            self.fail(error.to_string());
            return Err(error);
        }
        self.status.state = RecordingState::Recording;
        self.publish();
        Ok(self.status.clone())
    }

    fn pause_resume(
        &mut self,
        id: SessionId,
        resume: bool,
    ) -> Result<RecordingStatus, EngineError> {
        self.check_id(id)?;
        let expected = if resume {
            RecordingState::Paused
        } else {
            RecordingState::Recording
        };
        if self.status.state != expected {
            return Err(self.transition_error(if resume { "resume" } else { "pause" }));
        }
        let active = self
            .session
            .as_mut()
            .ok_or(EngineError::WorkerUnavailable)?;
        let result = if resume {
            active.resume()
        } else {
            active.pause()
        };
        if let Err(error) = result {
            self.fail(error.to_string());
            return Err(error);
        }
        self.status.state = if resume {
            RecordingState::Recording
        } else {
            RecordingState::Paused
        };
        self.publish();
        Ok(self.status.clone())
    }

    fn finish(
        &mut self,
        id: SessionId,
        reason: Option<&str>,
    ) -> Result<RecordingStatus, EngineError> {
        self.check_id(id)?;
        if self.session.is_none() {
            return Err(self.transition_error("stop"));
        }
        let reason = reason.or_else(|| {
            (self.status.state == RecordingState::Armed).then_some("stopped before start")
        });
        self.finalize(reason);
        Ok(self.status.clone())
    }

    fn restart(&mut self, id: SessionId) -> Result<RecordingStatus, EngineError> {
        self.check_id(id)?;
        if !matches!(
            self.status.state,
            RecordingState::Recording | RecordingState::Paused
        ) {
            return Err(self.transition_error("restart"));
        }
        let config = self
            .configuration
            .clone()
            .ok_or(EngineError::WorkerUnavailable)?;
        let output = self.output.clone().ok_or(EngineError::WorkerUnavailable)?;
        // A restart remains one active capture to hosts watching terminal states.
        self.finalize_take(Some("take restarted by host"), false);
        if self.status.state == RecordingState::Failed {
            self.publish();
            return Err(EngineError::Media(
                self.status
                    .error
                    .clone()
                    .unwrap_or_else(|| "take finalization failed".into()),
            ));
        }
        if let Err(error) = crate::project::discard_session(&output, config.project_id, id) {
            self.fail(error.to_string());
            return Err(error);
        }
        let prepared = match self.prepare(config) {
            Ok(prepared) => prepared,
            Err(error) => {
                self.fail(error.to_string());
                return Err(error);
            }
        };
        self.start(prepared.session_id.ok_or(EngineError::WorkerUnavailable)?)
    }

    fn finalize(&mut self, reason: Option<&str>) {
        self.finalize_take(reason, true);
    }

    fn finalize_take(&mut self, reason: Option<&str>, publish_terminal: bool) {
        self.status.state = RecordingState::Finalizing;
        self.publish();
        if let Some(session) = self.session.take() {
            match session.finish(reason) {
                Ok(manifest) => {
                    self.status.state = if reason.is_some() {
                        RecordingState::Interrupted
                    } else if manifest.completed {
                        RecordingState::Completed
                    } else {
                        RecordingState::Failed
                    };
                    self.status.manifest = Some(manifest);
                    self.status.error = reason.map(str::to_owned);
                }
                Err(error) => {
                    self.status.state = RecordingState::Failed;
                    self.status.error = Some(error.to_string());
                }
            }
        }
        if publish_terminal {
            self.publish();
        }
    }

    fn fail(&mut self, reason: String) {
        if self.session.is_some() {
            self.finalize(Some(&reason));
        }
        self.status.state = RecordingState::Failed;
        self.status.error = Some(match self.status.error.take() {
            Some(cleanup) if cleanup != reason => format!("{reason}; finalization: {cleanup}"),
            _ => reason,
        });
        self.publish();
    }
}
