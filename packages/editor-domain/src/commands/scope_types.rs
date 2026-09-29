//! Explicit addresses preserve clip command compatibility while exposing larger stacks.
use super::types::Reference;
use crate::{
    animation::{Binding, Interpolation, Keyframe, Value},
    effects::Instance,
    timing::{Time, TimeRange},
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ScopeAddress {
    Track {
        track: Reference,
    },
    Sequence {
        #[serde(rename = "sequenceId")]
        sequence_id: Uuid,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ScopedAction {
    Add {
        #[serde(rename = "definitionId")]
        definition_id: String,
        #[serde(rename = "definitionVersion")]
        definition_version: u32,
        #[serde(default)]
        parameters: BTreeMap<String, Binding>,
    },
    Update {
        instance: Instance,
    },
    Remove {
        instance: Reference,
    },
    Reorder {
        instance: Reference,
        index: usize,
    },
    Bypass {
        instance: Reference,
        enabled: bool,
    },
    Duplicate {
        instance: Reference,
    },
    Rename {
        instance: Reference,
        name: Option<String>,
    },
    Range {
        instance: Reference,
        range: Option<TimeRange>,
    },
    ParameterSet {
        instance: Reference,
        parameter: String,
        binding: Binding,
    },
    KeyframeAdd {
        instance: Reference,
        parameter: String,
        time: Time,
        value: Value,
        interpolation: Interpolation,
    },
    KeyframeUpdate {
        instance: Reference,
        parameter: String,
        keyframe: Keyframe,
    },
    KeyframeRemove {
        instance: Reference,
        parameter: String,
        #[serde(rename = "keyframeId")]
        keyframe_id: Uuid,
    },
}
