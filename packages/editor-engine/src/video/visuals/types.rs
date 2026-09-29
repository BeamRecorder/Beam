//! Source-only visual requests. Decoded samples never cross the JSON boundary.
use crate::{MediaAsset, PreviewFrame};
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    path::PathBuf,
    sync::{Arc, Condvar, Mutex, atomic::AtomicBool},
};
pub(super) const ANALYSIS_RATE: u32 = 48_000;

#[derive(Clone)]
pub struct Source {
    pub project_id: uuid::Uuid,
    pub root: PathBuf,
    pub asset: MediaAsset,
}

/// Cached artwork and decoders belong to the immutable source bytes.
#[derive(Clone, PartialEq)]
pub(super) struct SourceKey {
    pub project_id: uuid::Uuid,
    pub asset_id: uuid::Uuid,
    pub identity: Option<beam_editor_domain::project::types::SourceIdentity>,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "lowercase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum VisualRequest {
    Video {
        position_ms: u64,
    },
    Audio {
        start_ms: u64,
        end_ms: u64,
        step_ms: u64,
    },
}

#[derive(Clone, Debug)]
pub struct Waveform {
    pub start_ms: u64,
    pub duration_ms: u64,
    pub step_ms: u64,
    /// Peak plus four frequency envelopes, matching Blick's GPU input.
    pub points: Vec<[f32; 5]>,
    pub ready: Vec<bool>,
}

#[derive(Clone, Debug)]
pub enum Visual {
    Video(PreviewFrame),
    Audio(Waveform),
}
pub struct Update {
    pub visual: Visual,
    pub complete: bool,
}
pub type Cancel = Arc<AtomicBool>;
pub type Consumer = Box<dyn Fn(crate::Result<Update>) + Send + Sync>;

pub(super) struct Job {
    pub source: Source,
    pub request: VisualRequest,
    pub cancel: Cancel,
    pub consumer: Consumer,
    pub audio: Option<Analysis>,
}

pub(super) struct Analysis {
    pub data: Waveform,
    pub cursor: u64,
    pub bands: super::bands::Bands,
}

pub(super) struct AudioDecoder {
    pub pipeline: gst::Element,
    pub sink: gst_app::AppSink,
}

pub(super) struct VideoDecoder {
    pub pipeline: crate::video::worker::PipelineGuard,
    pub frames: crate::video::preview::Frames,
}

#[derive(Default)]
pub(super) struct Queue {
    pub pending: VecDeque<Job>,
    pub active: Option<Cancel>,
    pub stopped: bool,
}
pub(super) type Shared = Arc<(Mutex<Queue>, Condvar)>;
pub struct VisualWorker {
    pub(super) queue: Shared,
    pub(super) thread: Option<std::thread::JoinHandle<()>>,
}
