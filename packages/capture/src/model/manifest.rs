use serde::{Deserialize, Serialize};

use super::{PermissionSnapshot, ProjectId, SessionId, SourceId, TrackMetadata};

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformMetadata {
    pub os: String,
    pub architecture: String,
    pub backend: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedSources {
    pub screen: Option<SourceId>,
    pub system_audio: Option<SourceId>,
    pub microphone: Option<SourceId>,
    pub camera: Option<SourceId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionManifest {
    pub schema_version: u32,
    pub project_id: ProjectId,
    pub session_id: SessionId,
    pub created_at_utc: String,
    pub session_start_monotonic_ns: u64,
    pub duration_ns: u64,
    pub platform: PlatformMetadata,
    pub selected_sources: SelectedSources,
    pub tracks: Vec<TrackMetadata>,
    pub permissions: PermissionSnapshot,
    #[serde(default)]
    pub warnings: Vec<String>,
    pub completed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSession {
    pub session_id: SessionId,
    pub relative_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectManifest {
    pub schema_version: u32,
    pub project_id: ProjectId,
    #[serde(default)]
    pub name: String,
    pub created_at_utc: String,
    pub updated_at_utc: String,
    pub sessions: Vec<ProjectSession>,
}
