//! Definitions are immutable; every use is an independently identified instance.
use crate::{
    animation::{Binding, Value},
    timing::TimeRange,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum Domain {
    Video,
    Audio,
    Transition,
    Generator,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum ParameterType {
    Number { min: f64, max: f64, step: f64 },
    Boolean,
    Point,
    Color,
    Text,
    Choice { options: Vec<String> },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Parameter {
    pub key: String,
    pub label: String,
    pub group: String,
    pub unit: String,
    pub value_type: ParameterType,
    pub default: Value,
    pub animatable: bool,
}

/// Processing families are implemented by media backends, never interpreted by UI.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Processor {
    ColorBalance,
    Transform,
    Framing,
    TextPlacement,
    Opacity,
    Gain,
    CameraZoom,
    Cursor,
    Shader { fragment: String },
    TransitionShader { mask_fragment: String },
    Crossfade,
    Wipe { direction: WipeDirection },
    Solid,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum WipeDirection {
    Left,
    Right,
    Up,
    Down,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Definition {
    pub id: String,
    pub version: u32,
    pub label: String,
    pub domain: Domain,
    pub parameters: Vec<Parameter>,
    pub processor: Processor,
    pub timeline_region: bool,
    #[serde(
        default = "super::scope_types::clip_targets",
        skip_serializing_if = "super::scope_types::is_clip_targets"
    )]
    pub targets: Vec<super::scope_types::ScopeTarget>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Instance {
    pub id: Uuid,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub definition_id: String,
    pub definition_version: u32,
    pub enabled: bool,
    pub range: Option<TimeRange>,
    pub parameters: BTreeMap<String, Binding>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Transition {
    pub instance: Instance,
    pub from_clip: Uuid,
    pub to_clip: Uuid,
    pub duration_ms: u64,
}
