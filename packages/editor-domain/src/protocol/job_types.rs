//! Immutable job scope and opaque artifact resources shared by all transports.
use super::Container;
use crate::timing::Time;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderContext {
    pub project_id: Uuid,
    pub sequence_id: Uuid,
    pub expected_revision: u64,
    pub idempotency_key: String,
}
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum RenderQuality {
    Full,
    Half,
    Quarter,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum JobKind {
    Import {
        #[serde(rename = "sourceCount")]
        source_count: usize,
    },
    Export {
        container: Container,
    },
    Preview {
        time: Time,
        quality: RenderQuality,
    },
    Analysis {
        algorithm: super::AnalysisAlgorithm,
    },
    Proxy {
        settings: super::ProxySettings,
    },
}
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum JobPhase {
    Queued,
    Rendering,
    Completed,
    Cancelled,
    Failed,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceVersion {
    pub sha256: String,
    pub byte_length: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobInfo {
    pub id: Uuid,
    pub project_id: Uuid,
    pub scope: super::JobScope,
    pub revision: u64,
    pub kind: JobKind,
    pub phase: JobPhase,
    pub progress: f64,
    pub error: Option<String>,
    /// Populated before rendering begins; queued jobs may still be pinning their blocks.
    pub snapshot_id: Option<String>,
    pub source_versions: BTreeMap<Uuid, SourceVersion>,
    pub artifacts: Vec<Uuid>,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArtifactInfo {
    pub id: Uuid,
    pub job_id: Uuid,
    pub name: String,
    pub mime_type: String,
    pub byte_length: u64,
    pub sha256: String,
    pub width: u32,
    pub height: u32,
}
/// Bytes travel only through this explicitly bounded resource operation.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArtifactData {
    pub artifact_id: Uuid,
    pub offset: u64,
    pub byte_length: u64,
    pub data_base64: String,
    pub next: Option<u64>,
}
pub const ARTIFACT_CHUNK_BYTES: usize = 256 * 1024;
