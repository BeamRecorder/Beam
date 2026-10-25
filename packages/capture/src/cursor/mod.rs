mod backend;
mod telemetry;
#[cfg(any(windows, target_os = "macos"))]
mod worker_permit;
#[cfg(any(windows, target_os = "macos"))]
pub(crate) use worker_permit::{CursorWorkerPermit, cursor_worker_active};
#[cfg(any(windows, target_os = "macos", test))]
mod bitmap;
mod coordinates;
mod event_writer;
#[cfg(target_os = "macos")]
pub mod mac;
#[cfg(any(target_os = "macos", test))]
mod mac_button_event;
#[cfg(any(windows, target_os = "macos", test))]
mod recording_support;
#[cfg(any(target_os = "macos", test))]
mod resilient_source;
pub(crate) mod resize_classifier;
#[cfg(windows)]
pub mod win;
pub use backend::*;
pub use coordinates::*;
pub use event_writer::*;
#[cfg(any(windows, target_os = "macos", test))]
pub(crate) use recording_support::*;
