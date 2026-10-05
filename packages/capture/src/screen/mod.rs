mod crop;
mod desktop_policy;
mod frame;
#[cfg(any(windows, test))]
mod frame_buffer;
mod preview;
mod recording;
#[cfg(any(windows, target_os = "macos", test))]
mod recording_queue;
mod region_selection;
mod selection;

#[cfg(any(windows, target_os = "linux"))]
pub(crate) use crop::{PixelCrop, normalize_crop};
pub use frame::*;
pub use preview::*;
pub use recording::*;
pub use region_selection::*;
pub use selection::{SelectionBounds, WindowSelectionPreview, preview_window_selection};

#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "linux")]
pub use linux::{
    LinuxNativeCapabilities, PortalProperties, evaluate_capabilities,
    evaluate_capabilities_with_compositor, probe_native_capabilities,
};
#[cfg(target_os = "macos")]
pub mod mac;
#[cfg(windows)]
pub mod win;
