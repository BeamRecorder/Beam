use crate::{CameraPreview, EngineError, RecordingConfig};
use beam_media_manifest::SessionManifest;
use beam_media_session::{MediaSession, SessionConfig};
use std::path::PathBuf;

pub(crate) trait Session: Send {
    fn manifest(&self) -> &SessionManifest;
    fn start(&mut self) -> Result<(), EngineError>;
    fn poll(&mut self) -> Result<(), EngineError>;
    fn pause(&mut self) -> Result<(), EngineError>;
    fn resume(&mut self) -> Result<(), EngineError>;
    fn audio_levels(&self) -> beam_media_session::AudioLevels;
    fn preview(&self) -> Option<CameraPreview>;
    fn screen_preview(&self) -> Option<beam_screen::ScreenPreview>;
    fn finish(self: Box<Self>, interruption: Option<&str>) -> Result<SessionManifest, EngineError>;
}

pub(crate) type Prepare = fn(RecordingConfig, PathBuf) -> Result<Box<dyn Session>, EngineError>;

pub(crate) fn prepare(
    config: RecordingConfig,
    output_dir: PathBuf,
) -> Result<Box<dyn Session>, EngineError> {
    let session = MediaSession::prepare_for_project(
        SessionConfig {
            screen: config.screen,
            output_dir,
            camera: config.camera,
            microphone: config.microphone,
            system_audio: config.system_audio,
        },
        config.project_id,
    )
    .map_err(|error| match error {
        beam_media_session::SessionError::Screen(
            beam_screen::CaptureError::Cancelled
            | beam_screen::CaptureError::Native {
                code: beam_screen::NativeCaptureErrorCode::PortalCancelled,
                ..
            },
        ) => EngineError::Cancelled,
        other => EngineError::Media(other.to_string()),
    })?;
    Ok(Box::new(session))
}

impl Session for MediaSession {
    fn audio_levels(&self) -> beam_media_session::AudioLevels {
        self.audio_levels()
    }

    fn manifest(&self) -> &SessionManifest {
        self.manifest()
    }
    fn start(&mut self) -> Result<(), EngineError> {
        self.start()
            .map_err(|error| EngineError::Media(error.to_string()))
    }
    fn pause(&mut self) -> Result<(), EngineError> {
        self.pause()
            .map_err(|error| EngineError::Media(error.to_string()))
    }
    fn resume(&mut self) -> Result<(), EngineError> {
        self.resume()
            .map_err(|error| EngineError::Media(error.to_string()))
    }
    fn poll(&mut self) -> Result<(), EngineError> {
        self.poll()
            .map_err(|error| EngineError::Media(error.to_string()))
    }
    fn screen_preview(&self) -> Option<beam_screen::ScreenPreview> {
        self.screen_preview_source()
    }
    fn preview(&self) -> Option<CameraPreview> {
        self.camera_preview_source()
    }
    fn finish(self: Box<Self>, interruption: Option<&str>) -> Result<SessionManifest, EngineError> {
        match interruption {
            Some(reason) => (*self).interrupt(reason),
            None => (*self).stop(),
        }
        .map_err(|error| EngineError::Media(error.to_string()))
    }
}

#[path = "../test/backend.rs"]
pub(crate) mod backend_checks;

pub(crate) fn screen_error(error: beam_screen::CaptureError) -> EngineError {
    match error {
        beam_screen::CaptureError::Cancelled
        | beam_screen::CaptureError::Native {
            code: beam_screen::NativeCaptureErrorCode::PortalCancelled,
            ..
        } => EngineError::Cancelled,
        error => EngineError::Media(error.to_string()),
    }
}
