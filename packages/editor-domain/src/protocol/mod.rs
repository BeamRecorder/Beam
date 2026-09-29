//! Contract generation is independent from media, UI, CLI and MCP.
pub mod query_types;
pub mod read_types;
pub mod types;
pub use read_types::*;
pub use types::*;
pub mod job_types;
pub use job_types::*;
pub mod view_types;
pub use view_types::*;
pub mod source_types;
pub use source_types::*;

/// The same Rust schema supplies the SDK and MCP tool definitions.
pub fn schema() -> crate::Result<serde_json::Value> {
    let mut schema = serde_json::to_value(schemars::schema_for!(Contracts))?;
    schema["x-beam"] = serde_json::json!({
        "apiVersion": API_VERSION,
        "documentVersion": crate::project::types::DOCUMENT_VERSION,
        "messageBudgetBytes": MESSAGE_BUDGET,
        "pageLimit": crate::commands::query::PAGE_LIMIT,
    });
    Ok(schema)
}

impl From<&crate::MediaAsset> for AssetInfo {
    fn from(asset: &crate::MediaAsset) -> Self {
        Self {
            id: asset.id,
            name: asset.name.clone(),
            duration_ms: asset.duration_ms,
            width: asset.width,
            height: asset.height,
            has_video: asset.has_video,
            has_audio: asset.has_audio,
            is_image: asset.is_image,
            recording: asset.recording,
            telemetry: match asset.cursor_mode {
                crate::recording::style_types::CursorMode::Separated => Telemetry::Separated,
                crate::recording::style_types::CursorMode::BakedIn => Telemetry::BakedIn,
                crate::recording::style_types::CursorMode::Absent => Telemetry::Absent,
                crate::recording::style_types::CursorMode::Unknown => Telemetry::Unknown,
            },
            identity: asset.identity.clone(),
        }
    }
}
impl From<&crate::timeline::sequence_types::Sequence> for SequenceInfo {
    fn from(sequence: &crate::timeline::sequence_types::Sequence) -> Self {
        Self {
            id: sequence.id,
            name: sequence.name.clone(),
            canvas: sequence.state.canvas.clone(),
            recording_style: sequence.state.recording_style.clone(),
            track_count: sequence.state.tracks.len(),
            clip_count: sequence.state.clips.len(),
            duration_ms: sequence
                .state
                .clips
                .headers()
                .map(|c| c.start_ms.saturating_add(c.duration_ms))
                .max()
                .unwrap_or(0),
        }
    }
}

/// Transport failures carry stable machine-readable codes and conflict revisions.
impl From<&crate::EditorError> for ServiceError {
    fn from(error: &crate::EditorError) -> Self {
        use crate::EditorError;
        let code = match error {
            EditorError::Conflict { .. } => ErrorCode::Conflict,
            EditorError::Invalid(_) | EditorError::Json(_) => ErrorCode::InvalidRequest,
            EditorError::UnsupportedVersion(_) => ErrorCode::Unsupported,
            EditorError::Storage { .. } => ErrorCode::Storage,
            EditorError::Media(_) => ErrorCode::Media,
            EditorError::Stopped => ErrorCode::Stopped,
            EditorError::Unauthorized(_) => ErrorCode::Unauthorized,
        };
        let (expected_revision, actual_revision) = match error {
            EditorError::Conflict { expected, actual } => (Some(*expected), Some(*actual)),
            _ => (None, None),
        };
        Self {
            code,
            message: error.to_string(),
            expected_revision,
            actual_revision,
        }
    }
}
