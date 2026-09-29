//! ScreenCaptureKit exclusions keep desktop settings untouched on macOS.

use super::{DesktopCapabilities, DesktopOptions};
use crate::CaptureError;
use screencapturekit::shareable_content::SCShareableContent;

// CoreGraphics SDK enum keys; ask Quartz for the actual level rather than hardcode it.
const DOCK_WINDOW_LEVEL_KEY: u32 = 7;
const DESKTOP_ICON_WINDOW_LEVEL_KEY: u32 = 18;
#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGWindowLevelForKey(key: u32) -> i32;
}

#[derive(Default)]
pub(super) struct Appearance {
    excluded: Vec<String>,
}

pub(super) fn capabilities() -> Result<DesktopCapabilities, CaptureError> {
    Ok(DesktopCapabilities {
        taskbar: true,
        desktop_icons: true,
        capture_only: true,
    })
}

impl Appearance {
    pub(super) fn apply(&mut self, options: DesktopOptions) -> Result<(), CaptureError> {
        let content =
            SCShareableContent::get().map_err(|error| CaptureError::Backend(error.to_string()))?;
        // SAFETY: both constants are valid, documented CoreGraphics window level keys.
        let (dock_level, icon_level) = unsafe {
            (
                CGWindowLevelForKey(DOCK_WINDOW_LEVEL_KEY),
                CGWindowLevelForKey(DESKTOP_ICON_WINDOW_LEVEL_KEY),
            )
        };
        self.excluded = content
            .windows()
            .into_iter()
            .filter(|window| {
                let bundle = window
                    .owning_application()
                    .map(|app| app.bundle_identifier());
                (options.hide_taskbar
                    && bundle.as_deref() == Some("com.apple.dock")
                    && window.window_layer() == dock_level)
                    || (options.hide_desktop_icons && window.window_layer() == icon_level)
            })
            .map(|window| window.window_id().to_string())
            .collect();
        Ok(())
    }
    pub(super) fn excluded_window_handles(&self) -> Vec<String> {
        self.excluded.clone()
    }
    pub(super) fn restore(&mut self) -> Result<(), CaptureError> {
        self.excluded.clear();
        Ok(())
    }
}
