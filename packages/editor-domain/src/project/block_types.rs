//! Content-addressed pages keep telemetry and unchanged decisions out of checkpoints.
use super::types::Canvas;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const CLIPS_PER_PAGE: usize = 128;
pub const MAX_BLOCK_BYTES: usize = 64 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StateIndex {
    #[serde(default)]
    pub recording_style: crate::recording::style_types::RecordingStyle,
    pub name: String,
    pub canvas: Canvas,
    pub tracks: CollectionIndex,
    pub clips: CollectionIndex,
    pub transitions: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sequence_instances: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum CollectionIndex {
    Paged(Vec<crate::collections::PageReference>),
    LegacyHash(String),
    LegacyPages(Vec<String>),
}
#[derive(Default)]
pub(crate) struct BlockCache {
    pub clips: crate::collections::PageCache<crate::Clip>,
    pub tracks: crate::collections::PageCache<crate::Track>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SequenceIndex {
    pub id: Uuid,
    pub name: String,
    pub state: StateIndex,
    pub undo: Vec<StateIndex>,
    pub redo: Vec<StateIndex>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentIndex {
    #[serde(default)]
    pub project_undo: Vec<ProjectActionIndex>,
    #[serde(default)]
    pub project_redo: Vec<ProjectActionIndex>,
    pub storage_version: u32,
    pub schema_version: u32,
    pub revision: u64,
    pub project_id: Uuid,
    pub project_name: String,
    pub assets: Vec<String>,
    pub definitions: String,
    #[serde(default)]
    pub presets: Option<String>,
    #[serde(default)]
    pub extension_packs: Option<String>,
    pub warnings: Vec<String>,
    pub active_sequence: Uuid,
    pub sequences: Vec<SequenceIndex>,
    pub receipts: Vec<crate::commands::types::Receipt>,
    #[serde(default)]
    pub import_publications: Vec<crate::commands::import_types::ImportPublication>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_journal: Option<crate::commands::event_types::EventJournal>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum ProjectActionIndex {
    Rename {
        name: String,
    },
    RenameSequence {
        id: Uuid,
        name: String,
    },
    RemoveSequence {
        id: Uuid,
    },
    InsertSequence {
        sequence: Box<SequenceIndex>,
        index: usize,
        active: Uuid,
    },
}
