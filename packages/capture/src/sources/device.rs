use serde::{Deserialize, Serialize};

use crate::{CaptureError, model::SourceKind};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceFilter {
    #[serde(default)]
    pub kinds: Vec<SourceKind>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceDescriptor {
    pub id: String,
    pub kind: SourceKind,
    pub label: String,
    pub is_default: bool,
    pub permission: String,
}

pub trait DeviceCatalog: Send + Sync {
    fn list_devices(&self, filter: DeviceFilter) -> Result<Vec<DeviceDescriptor>, CaptureError>;
}
