//! Validates UI requests before opening capture devices or an editor process.

use super::{
    json,
    preferences::CaptureMode,
    types::{CaptureRequest, EditorMode, EditorRequest, SourceMode},
};
use beam_media_engine::{
    AudioSelection, CameraSelection, OutputLocation, ProjectId, RecordingConfig, ScreenRequest,
    ScreenSelection,
};
use beam_screen::model::{CursorSelection, PortalSourceKind, ScreenRegion, SourceId};
use serde_json::Value;

/// Validates an editor request and returns an argument for the current Argui executable.
/// Screenshot captures remain saved, but their legacy editor is not a native host.
pub(super) fn editor_argument(payload: Value) -> Result<String, String> {
    let request: EditorRequest = json::decode(payload)?;
    match request.mode {
        EditorMode::Video => Ok(format!("--editor={}", request.project_id)),
        EditorMode::Screenshot => Err(
            "Screenshot editing is not available in the native Argui app. The capture remains saved in Beam's screenshot library.".into(),
        ),
    }
}

pub(super) fn source(request: &CaptureRequest) -> Result<ScreenSelection, String> {
    let id = request.source_id.as_deref();
    if id.is_none_or(|id| id.starts_with("portal:")) {
        return Ok(ScreenSelection::Portal {
            kind: if request.source_mode == SourceMode::Window {
                PortalSourceKind::Window
            } else {
                PortalSourceKind::Monitor
            },
            restore_token: None,
        });
    }
    Ok(ScreenSelection::Source {
        source_id: SourceId::new(id.ok_or("select a capture source")?)
            .map_err(|error| error.to_string())?,
    })
}
pub(super) fn region(request: &CaptureRequest) -> Result<Option<ScreenRegion>, String> {
    if request.source_mode != SourceMode::Region {
        if request.region.is_some() {
            return Err("region requires region source mode".into());
        }
        return Ok(None);
    }
    let region = request.region.ok_or("select a screen region first")?;
    region.validate().map_err(|error| error.to_string())?;
    Ok(Some(region))
}
fn audio(id: Option<&str>) -> AudioSelection {
    match id {
        Some("default") => AudioSelection::Default,
        None | Some("" | "off" | "no-audio") => AudioSelection::Disabled,
        Some(id) => AudioSelection::Device(id.to_owned()),
    }
}
pub(super) fn recording_config(value: Value) -> Result<RecordingConfig, String> {
    let request: CaptureRequest = json::decode(value)?;
    let output = match request.mode {
        CaptureMode::Recorder => OutputLocation::Studio,
        CaptureMode::Instant => OutputLocation::Instant,
        CaptureMode::Screenshot => return Err("recording mode must be recorder or instant".into()),
    };
    let camera = match request.camera_id.as_deref() {
        None | Some("" | "off") => CameraSelection::Disabled,
        Some(id) => CameraSelection::Device(beam_camera::CameraRequest {
            device_id: id.to_owned(),
            width: 1280,
            height: 720,
            fps: 30,
        }),
    };
    Ok(RecordingConfig {
        output,
        project_id: ProjectId::new(),
        screen: Some(ScreenRequest {
            selection: source(&request)?,
            region: region(&request)?,
            cursor: CursorSelection::default(),
            fps: 30,
            excluded_window_handles: Vec::new(),
        }),
        camera,
        microphone: audio(request.microphone_id.as_deref()),
        system_audio: audio(request.system_audio_id.as_deref()),
    })
}

#[cfg(test)]
#[path = "../../test/beam/requests.rs"]
mod tests;
