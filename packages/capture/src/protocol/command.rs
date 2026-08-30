use serde::{Deserialize, Serialize};

use crate::model::CaptureRequest;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestEnvelope {
    pub id: String,
    #[serde(flatten)]
    pub command: Command,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "command", rename_all = "kebab-case")]
pub enum Command {
    Discover,
    Capabilities,
    Permissions,
    InputAccessStatus,
    RequestInputAccess,
    Formats {
        source: String,
    },
    SourcePreview {
        source: String,
        #[serde(rename = "maxWidth")]
        max_width: u32,
        #[serde(rename = "maxHeight")]
        max_height: u32,
    },
    Prepare {
        config: Box<CaptureRequest>,
    },
    Start,
    Pause,
    Resume,
    Cancel,
    Discard,
    Stop,
    Status,
    StartSystemAudioPreview,
    SystemAudioPreviewLevel,
    StopSystemAudioPreview,
}
