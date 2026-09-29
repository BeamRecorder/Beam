//! A preset is an immutable, versioned parameter template for an explicit definition.
use crate::animation::Binding;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preset {
    pub id: String,
    pub version: u32,
    pub label: String,
    pub definition_id: String,
    pub definition_version: u32,
    pub parameters: BTreeMap<String, Binding>,
}

#[derive(Clone, Debug, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum PresetTarget {
    Track {
        #[serde(rename = "trackId")]
        track_id: Uuid,
        #[serde(rename = "instanceId")]
        instance_id: Uuid,
    },
    Sequence {
        #[serde(rename = "sequenceId")]
        sequence_id: Uuid,
        #[serde(rename = "instanceId")]
        instance_id: Uuid,
    },
    Effect {
        #[serde(rename = "clipId")]
        clip_id: Uuid,
        #[serde(rename = "instanceId")]
        instance_id: Uuid,
    },
    Generator {
        #[serde(rename = "clipId")]
        clip_id: Uuid,
        #[serde(rename = "instanceId")]
        instance_id: Uuid,
    },
    Transition {
        #[serde(rename = "instanceId")]
        instance_id: Uuid,
    },
}
