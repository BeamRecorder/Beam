//! Native screen frames, screenshots, cursor and interaction backends.
pub mod clock;
pub mod cursor;
pub mod error;
pub mod gate;
pub mod input;
pub mod model;
pub mod screen;
pub mod screenshot;
pub use error::{CaptureError, NativeCaptureErrorCode};
pub mod storage {
    pub fn write_atomic(path: &std::path::Path, bytes: &[u8]) -> Result<(), crate::CaptureError> {
        Ok(beam_media_manifest::write_atomic(path, bytes)?)
    }
}

mod source;
mod source_queue;
mod source_types;
pub use source::{ScreenCapture, open_screen};
pub use source_types::*;

pub use screenshot::rgba_pixels;
mod discovery;
pub use discovery::{capabilities, list_sources, permissions};

mod telemetry;
pub use telemetry::ScreenTelemetry;

pub mod parent_watch;
