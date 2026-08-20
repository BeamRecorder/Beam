mod backend;
mod coordinates;
mod event_writer;
#[cfg(target_os = "macos")]
pub mod mac;
#[cfg(any(windows, target_os = "macos", test))]
mod recording_support;
#[cfg(windows)]
pub mod win;
pub use backend::*;
pub use coordinates::*;
pub use event_writer::*;
#[cfg(any(windows, target_os = "macos", test))]
pub(crate) use recording_support::*;
