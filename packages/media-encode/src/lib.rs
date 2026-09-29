//! Independent GStreamer writers for camera and PCM audio tracks.

mod error;
mod pipeline;
mod types;
mod video;
mod writer;

pub use error::EncodeError;
pub use types::{AudioConfig, QueueLimits, VideoConfig, VideoEncoding};
pub use writer::TrackWriter;
