//! Storage maintenance reports bytes and blocks without exposing managed paths.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GarbageCollection {
    pub retained_blocks: usize,
    pub removed_blocks: usize,
    pub freed_bytes: u64,
}
