//! Typed service and file schemas at the native capture boundary.

use beam_media_engine::{OutputLocation, ProjectId, RecordingStatus, SessionId};
use beam_screen::model::SourceKind;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Deserialize)]
pub(super) struct PackageMetadata {
    pub version: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ApplicationInfo {
    pub version: String,
    pub operating_system: &'static str,
    pub architecture: &'static str,
    pub logical_processors: usize,
    pub desktop_session: Option<String>,
}

#[derive(Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub(super) enum SourceMode {
    Display,
    Region,
    Window,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CaptureRequest {
    pub mode: super::preferences::CaptureMode,
    pub source_mode: SourceMode,
    pub source_id: Option<String>,
    pub camera_id: Option<String>,
    pub microphone_id: Option<String>,
    pub system_audio_id: Option<String>,
    pub region: Option<beam_screen::model::ScreenRegion>,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum EditorMode {
    Video,
    Screenshot,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct EditorRequest {
    pub project_id: ProjectId,
    pub mode: EditorMode,
}

#[derive(Clone, Copy)]
pub(super) struct ActiveCapture {
    pub id: SessionId,
    pub project: ProjectId,
    pub output: OutputLocation,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SourceOption {
    pub id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<SourceKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_default: Option<bool>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SourceCatalog {
    pub screens: Vec<SourceOption>,
    pub cameras: Vec<SourceOption>,
    pub microphones: Vec<SourceOption>,
    pub system_outputs: Vec<SourceOption>,
    pub errors: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CaptureStatus {
    #[serde(flatten)]
    pub status: RecordingStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<ProjectId>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ScreenshotMetadata {
    pub schema_version: u32,
    pub id: ProjectId,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub state: Option<serde_json::Value>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ScreenshotResult {
    pub project_id: ProjectId,
    pub path: PathBuf,
}
