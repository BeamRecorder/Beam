use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(target_os = "linux")]
use crate::model::{SourceCapabilities, SourceId, SourceKind, SourceSelectionMode};
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
        let (sources, capabilities, permissions, limitations) = platform_catalog()?;
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
fn platform_catalog() -> Result<
    (
        Vec<SourceDescriptor>,
        CaptureCapabilities,
        PermissionSnapshot,
        Vec<String>,
    ),
    CaptureError,
> {
    use std::time::Duration;

    let permissions = PermissionSnapshot {
        screen: Some(crate::model::PermissionState::PromptRequired),
        accessibility: Some(crate::model::PermissionState::NotApplicable),
    };
    let native = match crate::screen::linux::probe_native_capabilities(Duration::from_secs(2)) {
        Ok(value) => value,
        Err(error) => {
            return Ok((
                Vec::new(),
                CaptureCapabilities::default(),
                permissions,
                vec![error.to_string()],
            ));
        }
    };
    if let Err(error) = crate::screen::linux::probe_ffmpeg() {
        return Ok((
            Vec::new(),
            CaptureCapabilities::default(),
            permissions,
            vec![error.to_string()],
        ));
    }
    let mut sources = Vec::new();
    if native.display_capture {
        sources.push(portal_source(
            "portal:monitor",
            SourceKind::Display,
            "Choose a screen with the system picker",
            true,
        )?);
    }
    if native.window_capture {
        sources.push(portal_source(
            "portal:window",
            SourceKind::Window,
            "Choose a window with the system picker",
            !native.display_capture,
        )?);
    }
    let capabilities = CaptureCapabilities {
        display_capture: native.display_capture,
        window_capture: native.window_capture,
        portal_selection: native.portal_selection,
        embedded_cursor: native.embedded_cursor,
        separate_cursor: native.separate_cursor,
        cursor_shapes: false,
        cursor_clicks: false,
        ..CaptureCapabilities::default()
    };
    Ok((
        sources,
        capabilities,
        permissions,
        vec![
            "Linux Portal cursor metadata does not provide click events or portable cursor bitmaps"
                .into(),
        ],
    ))
}

#[cfg(target_os = "linux")]
fn portal_source(
    id: &str,
    kind: SourceKind,
    label: &str,
    is_default: bool,
) -> Result<SourceDescriptor, CaptureError> {
    Ok(SourceDescriptor {
        id: SourceId::new(id)?,
        kind,
        label: label.into(),
        is_default,
        selection_mode: SourceSelectionMode::Portal,
        display_id: None,
        capabilities: SourceCapabilities::default(),
    })
}

#[cfg(target_os = "macos")]
fn platform_catalog() -> Result<
    (
        Vec<SourceDescriptor>,
        CaptureCapabilities,
        PermissionSnapshot,
        Vec<String>,
    ),
    CaptureError,
> {
    Ok((
        crate::screen::mac::discover_sources().unwrap_or_default(),
        crate::screen::mac::capabilities(),
        crate::screen::mac::permissions(),
        Vec::new(),
    ))
}

#[cfg(windows)]
fn platform_catalog() -> Result<
    (
        Vec<SourceDescriptor>,
        CaptureCapabilities,
        PermissionSnapshot,
        Vec<String>,
    ),
    CaptureError,
> {
    Ok((
        crate::screen::win::discover_sources()?,
        crate::screen::win::capabilities(),
        crate::screen::win::permissions(),
        Vec::new(),
    ))
}

pub fn utc_now() -> Result<String, CaptureError> {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(|error| CaptureError::Backend(error.to_string()))
}
