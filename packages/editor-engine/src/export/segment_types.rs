//! One job, one encoder/muxer, bounded source graphs and raw queues.
/// A source graph consumes the immutable document and an absolute media window.
pub type SourceBuilder =
    fn(&std::path::Path, &crate::Project, u64, u64) -> crate::Result<ges::Pipeline>;
#[derive(Clone, Copy, Debug)]
pub struct SegmentPolicy {
    pub window_ms: u64,
    /// Adaptive allocation target, not a document limit. A single frame with
    /// more simultaneous sources keeps every input and reports the actual peak.
    pub target_native_clips: usize,
}
impl Default for SegmentPolicy {
    fn default() -> Self {
        Self {
            window_ms: 10_000,
            target_native_clips: 128,
        }
    }
}
#[derive(Clone, Copy, Debug, Default)]
pub struct SegmentReport {
    pub segments: u64,
    pub video_frames: u64,
    pub audio_samples: u64,
    pub peak_native_clips: usize,
}
#[derive(Clone, Copy, Debug)]
pub struct Segment {
    pub start_frame: u64,
    pub end_frame: u64,
    pub start_ns: u64,
    pub end_ns: u64,
    pub start_audio: u64,
    pub end_audio: u64,
}
/// A blocked raw handoff is released by stopping its downstream encoder first.
/// Successful windows clear that dependency so the encoder keeps running.
pub(crate) struct PipelineGuard(pub gst::Pipeline, pub Option<gst::Pipeline>);
impl PipelineGuard {
    pub fn finish(mut self) {
        self.1 = None;
    }
}
impl Drop for PipelineGuard {
    fn drop(&mut self) {
        use gst::prelude::*;
        if let Some(downstream) = &self.1 {
            let _ = downstream.set_state(gst::State::Null);
        }
        let _ = self.0.set_state(gst::State::Null);
    }
}
pub(crate) struct Encoder {
    pub pipeline: gst::Pipeline,
    pub video: gst_app::AppSrc,
    pub audio: Option<gst_app::AppSrc>,
    pub context: Option<gst::Context>,
    pub _guard: PipelineGuard,
}
#[derive(Default)]
pub(crate) struct StreamCounters {
    pub video: std::sync::atomic::AtomicU64,
    pub audio: std::sync::atomic::AtomicU64,
}
