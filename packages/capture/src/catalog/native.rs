use std::sync::atomic::{AtomicU64, Ordering};

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
    // The raw Portal/PipeWire path is diagnostic-only until a product sink can
    // finalize playable Beam segments. Do not advertise a selectable source.
    Ok(Vec::new())
}

#[cfg(target_os = "linux")]
fn platform_metadata() -> (CaptureCapabilities, PermissionSnapshot, Vec<String>) {
    (
        CaptureCapabilities::default(),
        PermissionSnapshot {
            screen: Some(crate::model::PermissionState::PromptRequired),
            accessibility: Some(crate::model::PermissionState::NotApplicable),
        },
        vec![
            "Linux native screen acquisition is available only through the opt-in capture probe until a product video sink is implemented".into(),
        ],
    )
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
