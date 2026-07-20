use serde::{Deserialize, Serialize};

use super::{SegmentId, SourceId, TrackId};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TrackKind {
    Screen,
    SystemAudio,
    Microphone,
    Camera,
    Cursor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TrackStatus {
    Preparing,
    Recording,
    Paused,
    Completed,
    Failed,
    Interrupted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentMetadata {
    pub segment_id: SegmentId,
    pub path: String,
    pub start_ns: u64,
    pub end_ns: Option<u64>,
    pub complete: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackMetrics {
    pub frames_received: u64,
    pub frames_dropped: u64,
    pub samples_received: u64,
    pub samples_dropped: u64,
    pub interruptions: u64,
    pub configuration_changes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "mediaType",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum TrackFormat {
    Video {
        codec: String,
        width: u32,
        height: u32,
        nominal_fps: u32,
    },
    Audio {
        sample_format: String,
        sample_rate: u32,
        channels: u16,
    },
    Events {
        format: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackMetadata {
    pub track_id: TrackId,
    pub kind: TrackKind,
    pub source_id: Option<SourceId>,
    pub format: TrackFormat,
    pub segments: Vec<SegmentMetadata>,
    pub metrics: TrackMetrics,
    pub status: TrackStatus,
    pub termination_reason: Option<String>,
}
