use crate::{CaptureError, model::TrackMetrics};

pub mod audio;
pub mod device;
pub mod video;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SessionNs(pub u64);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StartAt(pub SessionNs);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SourceContext {
    pub queue_capacity: usize,
    pub start_at: StartAt,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceReport {
    pub metrics: TrackMetrics,
    pub failure: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SegmentReport {
    pub start: SessionNs,
    pub end: SessionNs,
    pub packets: u64,
}

pub trait TrackSource: Send {
    fn prepare(&mut self, context: &SourceContext) -> Result<(), CaptureError>;
    fn start(&mut self, start: StartAt) -> Result<(), CaptureError>;
    fn pause(&mut self, at: SessionNs) -> Result<(), CaptureError>;
    fn stop(&mut self, at: SessionNs) -> Result<SourceReport, CaptureError>;
}

pub trait PacketWriter {
    fn push(&mut self, packet: crate::model::MediaPacket) -> Result<(), CaptureError>;
    fn finish(&mut self, end: SessionNs) -> Result<SegmentReport, CaptureError>;
}
