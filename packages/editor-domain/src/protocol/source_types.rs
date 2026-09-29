//! Source jobs target immutable media, independently from any sequence selection.
use crate::{project::types::SourceIdentity, recording::types::Zoom, timing::FrameRate};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceContext {
    pub project_id: Uuid,
    pub asset_id: Uuid,
    pub expected_revision: u64,
    pub idempotency_key: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum AnalysisAlgorithm {
    ZoomClicksV1,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProxySettings {
    pub container: super::Container,
    pub width: u32,
    pub height: u32,
    pub frame_rate: FrameRate,
}

/// JSON artifact with explicit immutable source and telemetry provenance.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceAnalysis {
    pub project_id: Uuid,
    pub asset_id: Uuid,
    pub revision: u64,
    pub source_identity: SourceIdentity,
    pub telemetry_sha256: String,
    pub algorithm: AnalysisAlgorithm,
    pub suggestions: Vec<Zoom>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum JobContext {
    Sequence { context: super::RenderContext },
    Source { context: SourceContext },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum JobScope {
    Sequence {
        #[serde(rename = "sequenceId")]
        sequence_id: Uuid,
    },
    Source {
        #[serde(rename = "assetId")]
        asset_id: Uuid,
    },
}
