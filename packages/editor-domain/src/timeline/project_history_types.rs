//! Project metadata history is independent of each sequence's content history.
use super::sequence_types::Sequence;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum ProjectAction {
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
        sequence: Box<Sequence>,
        index: usize,
        active: Uuid,
    },
}
