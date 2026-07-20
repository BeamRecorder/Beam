use crate::{CaptureError, model::TrackId};

pub trait PreparedTrack: Send {
    fn track_id(&self) -> TrackId;
    fn start(&mut self, t0_ns: u64) -> Result<(), CaptureError>;
    fn pause(&mut self, at_ns: u64) -> Result<(), CaptureError>;
    fn resume(&mut self, at_ns: u64) -> Result<(), CaptureError>;
    fn stop(&mut self, at_ns: u64) -> Result<(), CaptureError>;
}

pub trait TrackFactory: Send + Sync {
    fn prepare(&self) -> Result<Box<dyn PreparedTrack>, CaptureError>;
}
