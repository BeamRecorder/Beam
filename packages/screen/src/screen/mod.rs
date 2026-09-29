mod crop;
mod frame;
mod preview;
mod recording;
mod source_geometry;

#[cfg(target_os = "linux")]
pub(crate) use crop::PixelCrop;
#[cfg(any(windows, target_os = "linux"))]
pub(crate) use crop::normalize_crop;
pub use frame::*;
pub use preview::*;
pub use recording::*;
pub use source_geometry::*;

#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "linux")]
pub use linux::{
    LinuxNativeCapabilities, PortalProperties, evaluate_capabilities, probe_native_capabilities,
};
#[cfg(target_os = "macos")]
pub mod mac;
#[cfg(windows)]
pub mod win;
