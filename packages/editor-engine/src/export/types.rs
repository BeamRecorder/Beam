//! Export format and progress contract.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Container {
    Mp4,
    Webm,
}
impl Container {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Mp4 => "mp4",
            Self::Webm => "webm",
        }
    }
}
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportStatus {
    pub phase: ExportPhase,
    pub progress: f64,
    pub error: Option<String>,
}
#[derive(Clone, Copy, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExportPhase {
    #[default]
    Idle,
    Rendering,
    Completed,
    Cancelled,
    Failed,
}

/// A validated hardware factory and its encoded stream contract.
#[derive(Clone, Copy, Debug)]
pub struct VideoEncoder {
    pub codec: &'static str,
    pub caps: &'static str,
    pub factory: &'static str,
}
impl VideoEncoder {
    pub const fn new(codec: &'static str, caps: &'static str, factory: &'static str) -> Self {
        Self {
            codec,
            caps,
            factory,
        }
    }
}
/// Codec details displayed before the user chooses a destination.
#[derive(Clone, Debug, Serialize)]
pub struct ExportEncoding {
    pub container: Container,
    pub codec: String,
    pub encoder: String,
}
