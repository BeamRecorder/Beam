//! Transport-independent commands and durable transaction receipts.
use crate::{Edit, animation::Binding, effects::Instance};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(untagged)]
pub enum Reference {
    Id(Uuid),
    Created {
        #[serde(rename = "createdBy")]
        created_by: String,
        #[serde(default)]
        index: usize,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Operation {
    ScopedEffect {
        target: super::scope_types::ScopeAddress,
        action: super::scope_types::ScopedAction,
    },
    Edit {
        edit: Edit,
    },
    Insert {
        #[serde(rename = "assetId")]
        asset_id: Uuid,
        track: Reference,
        #[serde(rename = "startMs")]
        start_ms: u64,
        #[serde(rename = "sourceInMs")]
        source_in_ms: u64,
        #[serde(rename = "durationMs")]
        duration_ms: u64,
    },
    EffectAdd {
        clip: Reference,
        #[serde(rename = "definitionId")]
        definition_id: String,
        #[serde(rename = "definitionVersion")]
        definition_version: u32,
        parameters: BTreeMap<String, Binding>,
    },
    ParameterSet {
        clip: Reference,
        instance: Reference,
        parameter: String,
        binding: Binding,
    },
    ApplyPreset {
        target: crate::effects::preset_types::PresetTarget,
        #[serde(rename = "presetId")]
        preset_id: String,
        #[serde(rename = "presetVersion")]
        preset_version: u32,
    },
    AssetRetarget {
        #[serde(rename = "assetId")]
        asset_id: Uuid,
        #[serde(rename = "previousAssetId")]
        previous_asset_id: Uuid,
        #[serde(rename = "clipIds")]
        clip_ids: Vec<Uuid>,
    },
    EffectRangeAt {
        clip: Reference,
        instance: Reference,
        start: crate::timing::Time,
        end: crate::timing::Time,
    },
    CurveSpace {
        clip: Reference,
        instance: Reference,
        parameter: String,
        space: crate::timing::TimeSpace,
    },
    InstanceRename {
        clip: Reference,
        instance: Reference,
        name: Option<String>,
    },
    KeyframeAdd {
        clip: Reference,
        instance: Reference,
        parameter: String,
        space: crate::timing::TimeSpace,
        time: crate::timing::Time,
        value: crate::animation::Value,
        interpolation: crate::animation::Interpolation,
    },
    KeyframeAt {
        clip: Reference,
        instance: Reference,
        parameter: String,
        space: crate::timing::TimeSpace,
        #[serde(rename = "sequenceTime")]
        sequence_time: crate::timing::Time,
        value: crate::animation::Value,
        interpolation: crate::animation::Interpolation,
    },
    KeyframeUpdate {
        clip: Reference,
        instance: Reference,
        parameter: String,
        keyframe: crate::animation::Keyframe,
    },
    KeyframeRemove {
        clip: Reference,
        instance: Reference,
        parameter: String,
        #[serde(rename = "keyframeId")]
        keyframe_id: Uuid,
    },
    EffectDuplicate {
        clip: Reference,
        instance: Reference,
    },
    TransitionAdd {
        #[serde(rename = "fromClip")]
        from_clip: Reference,
        #[serde(rename = "toClip")]
        to_clip: Reference,
        #[serde(rename = "definitionId")]
        definition_id: String,
        #[serde(rename = "definitionVersion")]
        definition_version: u32,
        #[serde(rename = "durationMs")]
        duration_ms: u64,
    },
    GeneratorInsert {
        track: Reference,
        #[serde(rename = "definitionId")]
        definition_id: String,
        #[serde(rename = "definitionVersion")]
        definition_version: u32,
        #[serde(rename = "startMs")]
        start_ms: u64,
        #[serde(rename = "durationMs")]
        duration_ms: u64,
        parameters: BTreeMap<String, Binding>,
    },
    CopyPaste {
        clips: Vec<Uuid>,
        #[serde(rename = "sourceSequence")]
        source_sequence: Uuid,
        #[serde(rename = "destinationTrack")]
        destination_track: Reference,
        #[serde(rename = "startMs")]
        start_ms: u64,
    },
    PasteMapped {
        clips: Vec<Uuid>,
        #[serde(rename = "sourceSequence")]
        source_sequence: Uuid,
        #[serde(rename = "trackMap")]
        track_map: BTreeMap<Uuid, Reference>,
        #[serde(rename = "startMs")]
        start_ms: u64,
    },
    RegisterPack {
        pack: crate::effects::ExtensionPack,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Command {
    pub command_id: String,
    pub operation: Operation,
}
#[derive(Clone, Debug, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Transaction {
    pub api_version: u32,
    pub project_id: Uuid,
    pub sequence_id: Uuid,
    pub expected_revision: u64,
    pub idempotency_key: String,
    pub commands: Vec<Command>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommandResult {
    pub command_id: String,
    pub created: Vec<Uuid>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Receipt {
    pub sequence_id: Uuid,
    pub idempotency_key: String,
    pub fingerprint: String,
    pub revision: u64,
    pub results: Vec<CommandResult>,
}
#[derive(Clone, Debug, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> {
    pub revision: u64,
    pub items: Vec<T>,
    pub next: Option<usize>,
    pub total: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub revision: u64,
    pub sequence_id: Uuid,
    pub parameter_only: bool,
    pub affected_clips: Vec<Uuid>,
}
#[derive(Clone, Debug)]
pub struct Prepared {
    pub document: crate::Document,
    pub receipt: Receipt,
    pub change: Change,
    pub replay: bool,
}

pub fn instance_from(clip: &crate::Clip, id: Uuid) -> Option<&Instance> {
    clip.instances.iter().find(|i| i.id == id)
}
