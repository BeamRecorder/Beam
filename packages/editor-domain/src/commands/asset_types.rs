//! Relink request identity excludes session grants and generated managed filenames.
use crate::{project::types::SourceIdentity, protocol::RenderContext};
use serde::Serialize;
use uuid::Uuid;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RelinkFingerprint<'a> {
    pub context: &'a RenderContext,
    pub previous_asset_id: Uuid,
    pub clip_ids: &'a [Uuid],
    pub source_identity: &'a SourceIdentity,
}
