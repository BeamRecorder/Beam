use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureDiagnostics {
    pub platform: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linux: Option<LinuxCaptureDiagnostics>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinuxCaptureDiagnostics {
    pub distribution: Option<String>,
    pub distribution_id: Option<String>,
    #[serde(default)]
    pub distribution_like: Vec<String>,
    pub distribution_version: Option<String>,
    pub kernel: Option<String>,
    pub architecture: String,
    pub desktop: Option<String>,
    pub session_type: String,
    pub display_server: String,
    pub backend: String,
    pub portal: PortalDiagnostic,
    pub pipewire: RequirementDiagnostic,
    pub ffmpeg: FfmpegDiagnostic,
    pub recording_available: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequirementDiagnostic {
    pub available: bool,
    pub error_code: Option<String>,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortalDiagnostic {
    pub available: bool,
    pub version: Option<u32>,
    pub monitor: Option<bool>,
    pub window: Option<bool>,
    pub metadata_cursor: Option<bool>,
    pub error_code: Option<String>,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegDiagnostic {
    pub available: bool,
    pub encoder: Option<String>,
    pub codec: Option<String>,
    pub hardware: Option<bool>,
    pub error_code: Option<String>,
    pub detail: Option<String>,
}
