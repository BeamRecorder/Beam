//! Saved sequences share immutable sources, but keep independent edits and history.
use crate::EditState;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Sequence {
    pub id: Uuid,
    pub name: String,
    pub state: EditState,
    pub undo: Vec<EditState>,
    pub redo: Vec<EditState>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SequenceView {
    pub id: Uuid,
    pub name: String,
}
