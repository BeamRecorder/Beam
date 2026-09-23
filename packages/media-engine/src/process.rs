//! Small JSON adapter: all recording state remains in RecordingController.
use crate::{
    API_VERSION, EngineError, RecordingController,
    protocol::{Command, Request, Response},
};
use serde_json::{Value, json};

pub fn handle(controller: &RecordingController, request: Request) -> Response {
    let result = if request.version != API_VERSION {
        Err(EngineError::InvalidConfiguration(format!(
            "unsupported media API version {}; expected {API_VERSION}",
            request.version
        )))
    } else {
        dispatch(controller, request.command)
    };
    match result {
        Ok(value) => Response {
            version: API_VERSION,
            request_id: request.id,
            ok: true,
            result: Some(value),
            error: None,
        },
        Err(error) => Response {
            version: API_VERSION,
            request_id: request.id,
            ok: false,
            result: None,
            error: Some(crate::protocol::ProtocolError {
                code: error.code().into(),
                message: error.to_string(),
            }),
        },
    }
}
fn value(value: impl serde::Serialize) -> Result<Value, EngineError> {
    serde_json::to_value(value).map_err(|error| EngineError::Media(error.to_string()))
}
fn dispatch(controller: &RecordingController, command: Command) -> Result<Value, EngineError> {
    let status = match command {
        Command::Prepare { config } => controller.prepare(config.into()),
        Command::Start { session_id } => controller.start(session_id),
        Command::Pause { session_id } => controller.pause(session_id),
        Command::Resume { session_id } => controller.resume(session_id),
        Command::Stop { session_id } => controller.stop(session_id),
        Command::Cancel { session_id } => controller.cancel(session_id),
        Command::Status {} => return value(controller.status()),
        Command::Events { after_sequence } => return value(controller.events(after_sequence)),
        Command::Levels { session_id } => {
            return value(
                controller
                    .audio_levels(session_id)
                    .map_err(|error| EngineError::Media(error.to_string()))?,
            );
        }
        Command::Capabilities {} => {
            return value(
                controller
                    .capabilities()
                    .map_err(|error| EngineError::Media(error.to_string()))?,
            );
        }
        Command::Permissions {} => return value(controller.permissions()),
        Command::ScreenPreview { session_id } => {
            let sample = controller
                .screen_preview(session_id)?
                .and_then(|preview| preview.take());
            let thumbnail = sample
                .map(|sample| {
                    let rgba = beam_screen::rgba_pixels(&sample.frame)
                        .map_err(crate::backend::screen_error)?;
                    beam_screen::screen::rgba_thumbnail(
                        &rgba,
                        sample.frame.width,
                        sample.frame.height,
                        640,
                        360,
                    )
                    .map_err(crate::backend::screen_error)
                })
                .transpose()?;
            return value(thumbnail);
        }
        Command::CameraPreview { session_id } => {
            let frame = controller
                .camera_preview(session_id)?
                .and_then(|preview| preview.take());
            let thumbnail = frame
                .map(|frame| {
                    let rgba = frame
                        .data
                        .to_rgba()
                        .map_err(|error| EngineError::Media(error.to_string()))?;
                    beam_screen::screen::rgba_thumbnail(&rgba, frame.width, frame.height, 640, 360)
                        .map_err(|error| EngineError::Media(error.to_string()))
                })
                .transpose()?;
            return value(thumbnail);
        }
        Command::Screenshot { config } => {
            return value(controller.capture_still(config)?);
        }
        Command::SourcePreview {
            source_id,
            width,
            height,
        } => {
            return value(controller.source_preview(&source_id, width, height)?);
        }
        Command::ResolveDisplay { x, y } => {
            #[cfg(windows)]
            return value(
                beam_screen::screen::win::source_at_point(x, y)
                    .map_err(|error| EngineError::Media(error.to_string()))?,
            );
            #[cfg(not(windows))]
            {
                let _ = (x, y);
                return Err(EngineError::InvalidConfiguration(
                    "physical display resolution is Windows-only".into(),
                ));
            }
        }
        Command::InputAccess {} => return value(beam_screen::input::input_access_status()),
        Command::RequestInputAccess {} => {
            return value(
                beam_screen::input::request_input_access()
                    .map_err(|error| EngineError::Media(error.to_string()))?,
            );
        }
        Command::Sources {} => {
            let sources = controller.list_sources();
            return Ok(json!({
                "screens": sources.screens,
                "cameras": sources.cameras.map(|items| items.into_iter().map(|item| json!({"id":item.id,"name":item.name})).collect::<Vec<_>>()),
                "microphones": sources.microphones.map(|items| items.into_iter().map(|item| json!({"id":item.id,"name":item.name,"isDefault":item.is_default})).collect::<Vec<_>>()),
                "systemOutputs": sources.system_outputs.map(|items| items.into_iter().map(|item| json!({"id":item.id,"name":item.name,"isDefault":item.is_default})).collect::<Vec<_>>()),
            }));
        }
    };
    value(status?)
}

#[path = "../test/process/worker.rs"]
mod worker_checks;
