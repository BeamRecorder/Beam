//! Read addresses name actual decision scopes with stable UUIDs, never command references.
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum ReadTarget {
    Clip {
        #[serde(rename = "sequenceId")]
        sequence_id: Uuid,
        #[serde(rename = "clipId")]
        clip_id: Uuid,
    },
    Track {
        #[serde(rename = "sequenceId")]
        sequence_id: Uuid,
        #[serde(rename = "trackId")]
        track_id: Uuid,
    },
    Sequence {
        #[serde(rename = "sequenceId")]
        sequence_id: Uuid,
    },
}

impl ReadTarget {
    pub fn sequence_id(self) -> Uuid {
        match self {
            Self::Clip { sequence_id, .. }
            | Self::Track { sequence_id, .. }
            | Self::Sequence { sequence_id } => sequence_id,
        }
    }
}
