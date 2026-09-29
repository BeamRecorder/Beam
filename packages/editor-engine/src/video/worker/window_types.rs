//! Pending preroll stays on the exclusive GES actor and is advanced without waiting.
use super::PipelineGuard;
use crate::video::preview::Frames;
use std::time::Instant;
use uuid::Uuid;

pub(super) enum WindowPhase {
    Preroll,
    Seek,
}
pub(super) struct WindowTask {
    pub pipeline: PipelineGuard,
    pub frames: Frames,
    pub revision: u64,
    pub sequence: Uuid,
    pub position: u64,
    pub cancelled: bool,
    pub phase: WindowPhase,
    pub started: Instant,
}
