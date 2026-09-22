//! Native camera discovery, capture and owned frame buffers.

mod buffer;
mod color;
mod error;
mod events;
mod types;
mod worker;

pub use error::CameraError;
pub use types::{
    CameraDevice, CameraEvent, CameraFormat, CameraFrame, CameraQueueLimits, CameraRequest,
    PixelFormat,
};

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::{CameraCapture, list_cameras, open_camera};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::{CameraCapture, list_cameras, open_camera};
#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::{CameraCapture, list_cameras, open_camera};
