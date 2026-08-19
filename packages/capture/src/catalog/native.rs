use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(target_os = "linux")]
use crate::model::{SourceCapabilities, SourceId, SourceKind, SourceSelectionMode};
use crate::{
    CaptureError,
    model::{CaptureCapabilities, CaptureDiagnostics, PermissionSnapshot, SourceDescriptor},
};

use super::{CatalogSnapshot, SourceCatalog};

#[derive(Debug, Default)]
pub struct NativeCatalog {
    generation: AtomicU64,
}

type PlatformCatalog = (
    Vec<SourceDescriptor>,
    CaptureCapabilities,
    PermissionSnapshot,
    CaptureDiagnostics,
    Vec<String>,
);

impl SourceCatalog for NativeCatalog {
    fn snapshot(&self) -> Result<CatalogSnapshot, CaptureError> {
        let (sources, capabilities, permissions, diagnostics, limitations) = platform_catalog()?;
        Ok(CatalogSnapshot {
            generation: self
                .generation
                .fetch_add(1, Ordering::Relaxed)
                .saturating_add(1),
            created_at_utc: utc_now()?,
            capabilities,
            permissions,
            diagnostics,
            limitations,
            sources,
        })
    }
}

#[cfg(target_os = "linux")]
fn platform_catalog() -> Result<PlatformCatalog, CaptureError> {
    use std::time::Duration;

    let permissions = PermissionSnapshot {
        screen: Some(crate::model::PermissionState::PromptRequired),
        accessibility: Some(crate::model::PermissionState::NotApplicable),
    };
    let probe = crate::screen::linux::probe_capture_environment(Duration::from_secs(2));
    let native = &probe.capabilities;
    let mut sources = Vec::new();
    if native.recording_available && native.display_capture {
        sources.push(portal_source(
            "portal:monitor",
            SourceKind::Display,
            "Choose a screen with the system picker",
            true,
        )?);
    }
    if native.recording_available && native.window_capture {
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
        cursor_shapes: native.cursor_shapes,
        cursor_clicks: native.cursor_clicks,
        input_shortcuts: native.cursor_clicks,
        hardware_h264: probe
            .ffmpeg
            .as_ref()
            .is_some_and(|value| value.encoder.is_hardware() && value.encoder.codec == "h264"),
        hardware_av1: probe
            .ffmpeg
            .as_ref()
            .is_some_and(|value| value.encoder.is_hardware() && value.encoder.codec == "av1"),
        hardware_vp9: probe
            .ffmpeg
            .as_ref()
            .is_some_and(|value| value.encoder.is_hardware() && value.encoder.codec == "vp9"),
        ..CaptureCapabilities::default()
    };
    let encoder = probe.ffmpeg.as_ref().map_or_else(
        || "FFmpeg is unavailable or does not provide a supported encoder".into(),
        |ffmpeg| {
            if ffmpeg.encoder.is_hardware() {
                format!(
                    "Linux recording uses the hardware {} encoder ({})",
                    ffmpeg.encoder.codec, ffmpeg.encoder.name
                )
            } else {
                format!(
                    "No working hardware encoder was found; Linux recording falls back to {} on CPU",
                    ffmpeg.encoder.name
                )
            }
        },
    );
    let input_limitation = if native.cursor_clicks {
        "Linux input monitoring records clicks and shortcut tokens without storing typed text"
    } else {
        "Install and authorize Beam interaction access to record clicks and keyboard shortcuts"
    };
    let mut limitations = vec![
        encoder,
        input_limitation.into(),
        "Linux cursor shapes are available when the Portal exposes separate cursor metadata".into(),
    ];
    if let Some(linux) = &probe.diagnostics.linux {
        for requirement in [
            linux
                .portal
                .detail
                .as_ref()
                .filter(|_| !linux.portal.available),
            linux
                .pipewire
                .detail
                .as_ref()
                .filter(|_| !linux.pipewire.available),
            linux
                .ffmpeg
                .detail
                .as_ref()
                .filter(|_| !linux.ffmpeg.available),
        ]
        .into_iter()
        .flatten()
        {
            if !limitations.contains(requirement) {
                limitations.push(requirement.clone());
            }
        }
    }
    Ok((
        sources,
        capabilities,
        permissions,
        probe.diagnostics,
        limitations,
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
fn platform_catalog() -> Result<PlatformCatalog, CaptureError> {
    Ok((
        crate::screen::mac::discover_sources().unwrap_or_default(),
        crate::screen::mac::capabilities(),
        crate::screen::mac::permissions(),
        CaptureDiagnostics {
            platform: "macos".into(),
            linux: None,
        },
        Vec::new(),
    ))
}

#[cfg(windows)]
fn platform_catalog() -> Result<PlatformCatalog, CaptureError> {
    Ok((
        crate::screen::win::discover_sources()?,
        crate::screen::win::capabilities(),
        crate::screen::win::permissions(),
        CaptureDiagnostics {
            platform: "windows".into(),
            linux: None,
        },
        Vec::new(),
    ))
}

pub fn utc_now() -> Result<String, CaptureError> {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(|error| CaptureError::Backend(error.to_string()))
}
