//! An import publishes immutable sources and clips, independently from edit receipts.
use crate::{Document, project::types::SourceIdentity, protocol::RenderContext};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportPublication {
    pub project_id: Uuid,
    pub sequence_id: Uuid,
    pub revision: u64,
    pub idempotency_key: String,
    pub fingerprint: String,
    pub asset_ids: Vec<Uuid>,
    pub clip_ids: Vec<Uuid>,
}

#[derive(Clone, Debug)]
pub struct PreparedImport {
    pub document: Document,
    pub publication: ImportPublication,
    pub replay: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ImportFingerprint<'a> {
    pub context: &'a RenderContext,
    pub sources: &'a [SourceIdentity],
}
