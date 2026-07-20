mod backend;
#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "macos")]
pub mod mac;
mod recorder;
#[cfg(windows)]
pub mod win;
pub use backend::*;
pub use recorder::*;
