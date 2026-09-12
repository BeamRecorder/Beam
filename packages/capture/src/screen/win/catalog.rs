use windows_capture::{monitor::Monitor, window::Window};

use crate::{
    CaptureError,
    model::{
        MediaFormat, SourceCapabilities, SourceDescriptor, SourceId, SourceKind,
        SourceSelectionMode,
    },
};

use super::compatibility::supports_cursor_exclusion;

// Electron converts its DIP display center to physical pixels before this lookup.
// MonitorFromPoint uses the actual desktop topology, including mixed DPI screens.
pub fn source_at_point(x: i32, y: i32) -> Result<SourceId, CaptureError> {
    use windows::Win32::{
        Foundation::POINT,
        Graphics::Gdi::{MONITOR_DEFAULTTONULL, MonitorFromPoint},
        UI::HiDpi::{DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, SetThreadDpiAwarenessContext},
    };
    let previous =
        unsafe { SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) };
    if previous.0.is_null() {
        return Err(backend_error(
            "Unable to resolve physical display coordinates",
        ));
    }
    let handle = unsafe { MonitorFromPoint(POINT { x, y }, MONITOR_DEFAULTTONULL) };
    unsafe {
        SetThreadDpiAwarenessContext(previous);
    }
    if handle.0.is_null() {
        return Err(CaptureError::SourceNotFound(format!("display at {x},{y}")));
    }
    let device = Monitor::from_raw_hmonitor(handle.0)
        .device_name()
        .map_err(backend_error)?;
    SourceId::new(format!("wgc:monitor:{device}"))
}

pub fn discover_sources() -> Result<Vec<SourceDescriptor>, CaptureError> {
    let mut sources = discover_monitors()?;
    sources.extend(discover_windows()?);
    Ok(sources)
}

pub fn discover_monitors() -> Result<Vec<SourceDescriptor>, CaptureError> {
    let primary = Monitor::primary().ok();
    let supports_cursor_exclusion = supports_cursor_exclusion();
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
                    supports_cursor_exclusion,
                },
            })
        })
        .collect()
}

pub fn discover_windows() -> Result<Vec<SourceDescriptor>, CaptureError> {
    let supports_cursor_exclusion = supports_cursor_exclusion();
    Window::enumerate()
        .map_err(backend_error)?
        .into_iter()
        .filter_map(|window| window_descriptor(window, supports_cursor_exclusion).transpose())
        .collect()
}

fn window_descriptor(
    window: Window,
    supports_cursor_exclusion: bool,
) -> Result<Option<SourceDescriptor>, CaptureError> {
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
            supports_cursor_exclusion,
        },
    }))
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!(
        "Windows Graphics Capture discovery failed: {error}"
    ))
}
