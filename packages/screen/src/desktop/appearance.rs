//! Scoped desktop hiding with rollback on preparation failure and cancellation.

use crate::CaptureError;
pub use types::{DesktopCapabilities, DesktopOptions};
#[cfg(target_os = "linux")]
#[path = "appearance/linux.rs"]
mod platform;
#[cfg(target_os = "macos")]
#[path = "appearance/mac.rs"]
mod platform;
#[cfg(windows)]
#[path = "appearance/win.rs"]
mod platform;
mod types;

pub fn capabilities() -> Result<DesktopCapabilities, CaptureError> {
    platform::capabilities()
}

/// Owns only changes made for this capture, restoring original visible states.
#[derive(Default)]
pub struct DesktopAppearance {
    state: platform::Appearance,
}

impl DesktopAppearance {
    pub fn begin(options: DesktopOptions) -> Result<Self, CaptureError> {
        let mut appearance = Self::default();
        if !options.hide_taskbar && !options.hide_desktop_icons {
            return Ok(appearance);
        }
        let supported = capabilities()?;
        if (options.hide_taskbar && !supported.taskbar)
            || (options.hide_desktop_icons && !supported.desktop_icons)
        {
            return Err(CaptureError::InvalidConfiguration(
                "the desktop does not support the requested hiding option".into(),
            ));
        }
        // The guard already exists, so any partial failure restores prior changes.
        appearance.state.apply(options)?;
        Ok(appearance)
    }

    pub fn excluded_window_handles(&self) -> Vec<String> {
        self.state.excluded_window_handles()
    }

    pub fn restore(&mut self) -> Result<(), CaptureError> {
        self.state.restore()
    }
}

impl Drop for DesktopAppearance {
    fn drop(&mut self) {
        let _ = self.restore();
    }
}
