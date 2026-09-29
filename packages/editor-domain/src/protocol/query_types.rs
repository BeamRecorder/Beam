//! Paged and targeted queries share the same generated Rust vocabulary.
use crate::timing::Time;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Query {
    ClipHeaders {
        #[serde(rename = "sequenceId")]
        sequence_id: Uuid,
        offset: usize,
        limit: usize,
    },
    ScopedParameterValues {
        target: super::ReadTarget,
        time: Time,
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
    Presets {
        offset: usize,
        limit: usize,
    },
    Clip {
        #[serde(rename = "sequenceId")]
        sequence_id: Uuid,
        #[serde(rename = "clipId")]
        clip_id: Uuid,
    },
    Project,
    Jobs {
        offset: usize,
        limit: usize,
    },
    Artifacts {
        offset: usize,
        limit: usize,
    },
    Grants {
        offset: usize,
        limit: usize,
    },
    Sequences {
        offset: usize,
        limit: usize,
    },
    Assets {
        offset: usize,
        limit: usize,
    },
    Asset {
        id: Uuid,
    },
    Tracks {
        #[serde(rename = "sequenceId")]
        sequence_id: Uuid,
        offset: usize,
        limit: usize,
    },
    Clips {
        #[serde(rename = "sequenceId")]
        sequence_id: Uuid,
        offset: usize,
        limit: usize,
    },
    Transitions {
        #[serde(rename = "sequenceId")]
        sequence_id: Uuid,
        offset: usize,
        limit: usize,
    },
    Definitions {
        offset: usize,
        limit: usize,
    },
    Regions {
        #[serde(rename = "sequenceId")]
        sequence_id: Uuid,
        start: Time,
        end: Time,
        offset: usize,
        limit: usize,
    },
    ParameterValues {
        #[serde(rename = "sequenceId")]
        sequence_id: Uuid,
        #[serde(rename = "clipId")]
        clip_id: Uuid,
        time: Time,
    },
    RecordingSuggestions {
        #[serde(rename = "assetId")]
        asset_id: Uuid,
        offset: usize,
        limit: usize,
    },
}
