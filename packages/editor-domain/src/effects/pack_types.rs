//! Immutable extension distribution and persisted catalogue provenance.
use super::{Definition, preset_types::Preset};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtensionPack {
    pub id: String,
    pub namespace: String,
    pub version: u32,
    pub sha256: String,
    pub definitions: Vec<Definition>,
    #[serde(default)]
    pub presets: Vec<Preset>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackDraft {
    pub id: String,
    pub namespace: String,
    pub version: u32,
    pub definitions: Vec<Definition>,
    #[serde(default)]
    pub presets: Vec<Preset>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogVersion {
    pub id: String,
    pub version: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackProvenance {
    pub id: String,
    pub namespace: String,
    pub version: u32,
    pub sha256: String,
    pub definitions: Vec<CatalogVersion>,
    #[serde(default)]
    pub presets: Vec<CatalogVersion>,
}
