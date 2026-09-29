//! Portable desktop appearance request and advertised native capabilities.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DesktopOptions {
    pub hide_taskbar: bool,
    pub hide_desktop_icons: bool,
}

#[derive(Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopCapabilities {
    pub taskbar: bool,
    pub desktop_icons: bool,
    /// macOS excludes desktop elements from capture without changing the desktop.
    pub capture_only: bool,
}
