//! Lane headers expose effect identities and regions without loading parameter curves.
use super::headers::InstanceHeader;
use crate::TrackKind;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TrackHeader {
    pub id: Uuid,
    pub name: String,
    pub kind: TrackKind,
    pub muted: bool,
    pub hidden: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub instances: Vec<InstanceHeader>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub keyframe_ids: Vec<Uuid>,
}
