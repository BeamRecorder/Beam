use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(target_os = "linux")]
use crate::model::{MediaFormat, SourceCapabilities, SourceId, SourceKind, SourceSelectionMode};
use crate::{
    CaptureError,
    model::{CaptureCapabilities, PermissionSnapshot, SourceDescriptor},
};

use super::{CatalogSnapshot, SourceCatalog};

#[derive(Debug, Default)]
pub struct NativeCatalog {
    generation: AtomicU64,
}

impl SourceCatalog for NativeCatalog {
    fn snapshot(&self) -> Result<CatalogSnapshot, CaptureError> {
        #[allow(unused_mut)]
        let mut sources = platform_screen_sources()?;
        let (capabilities, permissions, limitations) = platform_metadata();
        Ok(CatalogSnapshot {
            generation: self
                .generation
                .fetch_add(1, Ordering::Relaxed)
                .saturating_add(1),
            created_at_utc: utc_now()?,
            capabilities,
            permissions,
            limitations,
            sources,
        })
    }
}

#[cfg(target_os = "linux")]
fn platform_screen_sources() -> Result<Vec<SourceDescriptor>, CaptureError> {
    use crate::screen::linux::{LinuxDisplayServer, display_server};
    if matches!(display_server(), LinuxDisplayServer::Wayland) {
        return Ok(vec![SourceDescriptor {
            id: SourceId::new("portal:system-picker")?,
            kind: SourceKind::Display,
            label: "System screen/window picker".into(),
            is_default: true,
            selection_mode: SourceSelectionMode::Portal,
            display_id: None,
            capabilities: SourceCapabilities {
                supports_cursor_exclusion: true,
                ..SourceCapabilities::default()
            },
        }]);
    }
    let display = std::env::var("DISPLAY").unwrap_or_else(|_| ":0".into());
    Ok(vec![SourceDescriptor {
        id: SourceId::new(format!("x11:{display}"))?,
        kind: SourceKind::Display,
        label: format!("X11 display {display}"),
        is_default: true,
        selection_mode: SourceSelectionMode::Direct,
        display_id: None,
        capabilities: SourceCapabilities {
            formats: vec![MediaFormat::Video {
                width: 0,
                height: 0,
                fps: 60,
                pixel_format: None,
            }],
            supports_cursor_exclusion: true,
        },
    }])
}

#[cfg(target_os = "linux")]
fn platform_metadata() -> (CaptureCapabilities, PermissionSnapshot, Vec<String>) {
    let capabilities = crate::screen::linux::capabilities();
    let permissions = crate::screen::linux::permissions();
    let mut limitations = Vec::new();
    if capabilities.portal_selection && !capabilities.separate_cursor {
        limitations.push("The active Wayland compositor has not advertised separate cursor metadata; negotiate it when opening the portal stream".into());
    }
    (capabilities, permissions, limitations)
}

#[cfg(target_os = "macos")]
fn platform_screen_sources() -> Result<Vec<SourceDescriptor>, CaptureError> {
    Ok(crate::screen::mac::discover_sources().unwrap_or_default())
}
#[cfg(target_os = "macos")]
fn platform_metadata() -> (CaptureCapabilities, PermissionSnapshot, Vec<String>) {
    (
        crate::screen::mac::capabilities(),
        crate::screen::mac::permissions(),
        Vec::new(),
    )
}

#[cfg(windows)]
fn platform_screen_sources() -> Result<Vec<SourceDescriptor>, CaptureError> {
    crate::screen::win::discover_sources()
}
#[cfg(windows)]
fn platform_metadata() -> (CaptureCapabilities, PermissionSnapshot, Vec<String>) {
    (
        crate::screen::win::capabilities(),
        crate::screen::win::permissions(),
        Vec::new(),
    )
}

pub fn utc_now() -> Result<String, CaptureError> {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(|error| CaptureError::Backend(error.to_string()))
}
