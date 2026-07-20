use crate::{
    CaptureError,
    model::{SegmentMetadata, TrackMetrics},
};
pub trait VideoTrackWriter: Send {
    type Frame;
    fn begin_segment(&mut self, segment: &SegmentMetadata) -> Result<(), CaptureError>;
    fn write_frame(&mut self, timestamp_ns: u64, frame: Self::Frame) -> Result<(), CaptureError>;
    fn finish_segment(&mut self, end_ns: u64) -> Result<(), CaptureError>;
    fn metrics(&self) -> TrackMetrics;
}
pub trait AudioTrackWriter: Send {
    fn begin_segment(&mut self, segment: &SegmentMetadata) -> Result<(), CaptureError>;
    fn write_f32(&mut self, timestamp_ns: u64, samples: &[f32]) -> Result<(), CaptureError>;
    fn finish_segment(&mut self, end_ns: u64) -> Result<(), CaptureError>;
    fn metrics(&self) -> TrackMetrics;
}
