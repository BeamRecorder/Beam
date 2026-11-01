use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoEncodingDiagnostics {
    pub backend: String,
    pub codec: String,
    /// Requested MediaTranscoder mode; this does not identify its actual MFT or GPU.
    pub requested_mode: Option<String>,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub bitrate_bps: u32,
    pub queue_capacity: usize,
    pub initialization_ms: Option<u64>,
    pub initialization_error: Option<String>,
    pub attempts: Vec<VideoEncoderAttempt>,
    pub finalization: Option<VideoEncoderFinalization>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoEncoderAttempt {
    pub requested_mode: String,
    pub elapsed_ms: u64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoEncoderFinalization {
    pub elapsed_ms: u64,
    pub timeout_ms: u64,
    pub success: bool,
    pub error: Option<String>,
}
