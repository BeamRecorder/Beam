#[cfg(any(windows, target_os = "macos"))]
pub(crate) mod audio_common;
#[cfg(any(windows, target_os = "macos"))]
pub mod audio_level;
#[cfg(any(windows, target_os = "macos"))]
pub mod camera_preview;
#[cfg(target_os = "macos")]
#[path = "macos/mod.rs"]
pub mod mac;
#[cfg(any(windows, target_os = "macos"))]
pub(crate) mod preview_stream;
#[cfg(windows)]
#[path = "windows/mod.rs"]
pub mod win;
