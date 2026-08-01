#![doc = "Native, sidecar-oriented capture engine."]

pub mod catalog;
pub mod clock;
pub mod cursor;
pub mod error;
pub mod model;
pub mod protocol;
pub mod screen;
pub mod session;
pub mod storage;

pub use error::CaptureError;
