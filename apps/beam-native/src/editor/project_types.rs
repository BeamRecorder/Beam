use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct EditorIndex {
    pub project_id: String,
    pub project_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub kind: ProjectKind,
    pub updated_at_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ProjectKind {
    Recording,
    Instant,
    Project,
}

pub(super) struct ProjectEntry {
    pub summary: ProjectSummary,
    pub path: PathBuf,
}
