//! Strict editor service payloads; filesystem paths are chosen by the native host.
use beam_editor_engine::Edit;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct EditRequest {
    pub revision: u64,
    pub edit: Edit,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SeekRequest {
    pub position_ms: u64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct PlayRequest {
    pub playing: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct QualityRequest {
    pub quality: beam_editor_engine::video::types::PreviewQuality,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ExportRequest {
    pub container: beam_editor_engine::export::types::Container,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FrameResult {
    pub transport: beam_editor_engine::Transport,
    pub canvas_id: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CommandsRequest {
    pub revision: u64,
    pub sequence_id: uuid::Uuid,
    pub commands: Vec<beam_editor_engine::domain::commands::types::Command>,
}
