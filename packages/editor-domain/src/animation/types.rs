//! Closed parameter vocabulary and typed seek-independent keyframes.
use crate::timing::{Time, TimeSpace};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum Value {
    Number(f64),
    Boolean(bool),
    Choice(String),
    Text(String),
    Point([f64; 2]),
    Color([f64; 4]),
}
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Tangent {
    pub time: f64,
    pub value: f64,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Interpolation {
    Constant,
    Linear,
    Bezier {
        outgoing: Tangent,
        incoming: Tangent,
    },
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Keyframe {
    pub id: Uuid,
    pub time: Time,
    pub value: Value,
    pub interpolation: Interpolation,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Binding {
    Constant {
        value: Value,
    },
    Curve {
        space: TimeSpace,
        keys: Vec<Keyframe>,
    },
}
