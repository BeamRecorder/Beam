#![doc = "Native, sidecar-oriented capture engine."]

pub mod catalog;
pub mod clock;
pub mod cursor;
pub mod error;
pub mod input;
pub mod model;
pub mod parent_watch;
pub mod protocol;
pub mod screen;
pub mod session;
pub mod storage;
pub mod system_audio;

pub use error::{CaptureError, NativeCaptureErrorCode};
