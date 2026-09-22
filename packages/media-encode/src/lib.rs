//! Independent GStreamer writers for camera and PCM audio tracks.

mod error;
mod pipeline;
mod types;
mod writer;

pub use error::EncodeError;
pub use types::{AudioConfig, QueueLimits, VideoConfig};
pub use writer::TrackWriter;
