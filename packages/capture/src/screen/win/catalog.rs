use windows_capture::{monitor::Monitor, window::Window};

use crate::{
    CaptureError,
    model::{
        MediaFormat, SourceCapabilities, SourceDescriptor, SourceId, SourceKind,
        SourceSelectionMode,
    },
};

pub fn discover_sources() -> Result<Vec<SourceDescriptor>, CaptureError> {
    let mut sources = discover_monitors()?;
    sources.extend(discover_windows()?);
    Ok(sources)
}

pub fn discover_monitors() -> Result<Vec<SourceDescriptor>, CaptureError> {
    let primary = Monitor::primary().ok();
    Monitor::enumerate()
        .map_err(backend_error)?
        .into_iter()
        .map(|monitor| {
            let device_name = monitor.device_name().map_err(backend_error)?;
            let label = monitor
                .name()
                .ok()
                .filter(|name| !name.trim().is_empty())
                .unwrap_or_else(|| device_name.clone());
            let width = monitor.width().map_err(backend_error)?;
            let height = monitor.height().map_err(backend_error)?;
            let fps = monitor.refresh_rate().unwrap_or(60).max(1);
            Ok(SourceDescriptor {
                id: SourceId::new(format!("wgc:monitor:{device_name}"))?,
                kind: SourceKind::Display,
                label,
                is_default: primary == Some(monitor),
                selection_mode: SourceSelectionMode::Direct,
                display_id: Some(device_name.clone()),
                capabilities: SourceCapabilities {
                    formats: vec![MediaFormat::Video {
                        width,
                        height,
                        fps,
                        pixel_format: Some("bgra8".into()),
                    }],
                    supports_cursor_exclusion: true,
                },
            })
        })
        .collect()
}

pub fn discover_windows() -> Result<Vec<SourceDescriptor>, CaptureError> {
    Window::enumerate()
        .map_err(backend_error)?
        .into_iter()
        .filter_map(|window| window_descriptor(window).transpose())
        .collect()
}

fn window_descriptor(window: Window) -> Result<Option<SourceDescriptor>, CaptureError> {
    let title = window.title().map_err(backend_error)?;
    if title.trim().is_empty() {
        return Ok(None);
    }
    let process_id = window.process_id().map_err(backend_error)?;
    let width = u32::try_from(window.width().map_err(backend_error)?.max(1))
        .map_err(|error| CaptureError::Backend(error.to_string()))?;
    let height = u32::try_from(window.height().map_err(backend_error)?.max(1))
        .map_err(|error| CaptureError::Backend(error.to_string()))?;
    let process = window
        .process_name()
        .unwrap_or_else(|_| format!("pid-{process_id}"));
    Ok(Some(SourceDescriptor {
        id: SourceId::new(format!("wgc:window:{:x}", window.as_raw_hwnd() as usize))?,
        kind: SourceKind::Window,
        label: format!("{title} — {process}"),
        is_default: false,
        selection_mode: SourceSelectionMode::Direct,
        display_id: None,
        capabilities: SourceCapabilities {
            formats: vec![MediaFormat::Video {
                width,
                height,
                fps: 60,
                pixel_format: Some("bgra8".into()),
            }],
            supports_cursor_exclusion: true,
        },
    }))
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!(
        "Windows Graphics Capture discovery failed: {error}"
    ))
}
