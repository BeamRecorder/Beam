//! Native playback results; raster bytes never cross the JavaScript JSON bridge.
use crate::{Canvas, Clip, MediaAsset, Project, Track};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Default)]
pub struct FrameMailbox {
    pub(crate) pending: std::sync::Mutex<FrameSlot>,
    pub(crate) consumer: std::sync::Mutex<Option<FrameConsumer>>,
    pub(crate) ready: std::sync::Condvar,
    pub(crate) transport: std::sync::Mutex<super::gpu::types::PreviewTransport>,
    pub(crate) producer: std::sync::Mutex<Option<gst::Buffer>>,
    pub(crate) forward: std::sync::Mutex<std::sync::Weak<FrameMailbox>>,
    pub(crate) quality: std::sync::Mutex<PreviewQuality>,
}

/// Preview sampling is independent from source files and export dimensions.
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PreviewQuality {
    #[default]
    Full,
    Half,
    Quarter,
}
impl PreviewQuality {
    /// Returns the sampling divisor without changing aspect or timeline geometry.
    pub fn divisor(self) -> u32 {
        match self {
            Self::Full => 1,
            Self::Half => 2,
            Self::Quarter => 4,
        }
    }
}

#[derive(Default)]
pub(crate) struct FrameSlot {
    pub frame: Option<PreviewFrame>,
    pub window: Option<(u64, u64)>,
    pub ready: bool,
}

pub type FrameConsumer = std::sync::Arc<dyn Fn(PreviewFrame) + Send + Sync>;

#[derive(Clone, Debug)]
pub struct PreviewFrame {
    pub sequence: u64,
    pub position_ms: u64,
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    pub external: Option<super::gpu::types::ExternalFrame>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transport {
    pub position_ms: u64,
    pub duration_ms: u64,
    pub playing: bool,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorSnapshot {
    pub active_sequence: Uuid,
    pub sequences: Vec<crate::timeline::sequence_types::SequenceView>,
    pub project: ProjectView,
    pub revision: u64,
    pub can_undo: bool,
    pub can_redo: bool,
    pub recovered: bool,
    pub transport: Transport,
    pub export_formats: Vec<crate::export::types::ExportEncoding>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetView {
    pub id: Uuid,
    pub name: String,
    pub duration_ms: u64,
    pub width: u32,
    pub height: u32,
    pub has_video: bool,
    pub has_audio: bool,
    pub is_image: bool,
    pub has_cursor: bool,
    pub zoom_count: usize,
    pub recording: bool,
}
impl From<&MediaAsset> for AssetView {
    fn from(a: &MediaAsset) -> Self {
        Self {
            id: a.id,
            name: a.name.clone(),
            duration_ms: a.duration_ms,
            width: a.width,
            height: a.height,
            has_video: a.has_video,
            has_audio: a.has_audio,
            is_image: a.is_image,
            has_cursor: !a.cursor.is_empty(),
            zoom_count: a.zooms.len(),
            recording: a.recording,
        }
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectView {
    pub id: Uuid,
    pub name: String,
    pub canvas: Canvas,
    pub assets: Vec<AssetView>,
    pub tracks: Vec<Track>,
    pub clips: Vec<Clip>,
    pub warnings: Vec<String>,
}
impl From<&Project> for ProjectView {
    fn from(p: &Project) -> Self {
        Self {
            id: p.id,
            name: p.name.clone(),
            canvas: p.canvas.clone(),
            assets: p.assets.iter().map(AssetView::from).collect(),
            tracks: p.tracks.clone(),
            clips: p.clips.clone(),
            warnings: p.warnings.clone(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Probe {
    pub duration_ms: u64,
    pub width: u32,
    pub height: u32,
    pub has_video: bool,
    pub has_audio: bool,
    #[serde(default)]
    pub is_image: bool,
}
