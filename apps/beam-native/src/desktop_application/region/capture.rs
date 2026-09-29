//! Resolves the overlay monitor to the same native source used for recording.

#[cfg(target_os = "linux")]
use super::source_monitor::granted_monitor;
use super::types::{MonitorCapture, ScreenPixels};
use argui_runtime::{NativeMonitorInfo, NativeWindowInfo};
#[cfg(target_os = "linux")]
use beam_screen::screenshot::capture_frame_with_geometry;
use beam_screen::{
    desktop::window_bounds,
    model::{ScreenSelection, SourceKind},
    screenshot::{ScreenshotRequest, capture_frame},
};

/// Selects the HUD's monitor using physical coordinates, including negative origins.
pub(super) fn monitor_for_window<'a>(
    info: &NativeWindowInfo,
    monitors: &'a [NativeMonitorInfo],
) -> Option<&'a NativeMonitorInfo> {
    let center = info.x.zip(info.y).map(|(x, y)| {
        (
            (x + info.width / 2.0) * info.scale_factor,
            (y + info.height / 2.0) * info.scale_factor,
        )
    });
    monitors
        .iter()
        .find(|monitor| {
            center.is_some_and(|(x, y)| {
                x >= f64::from(monitor.x)
                    && y >= f64::from(monitor.y)
                    && x < f64::from(monitor.x) + f64::from(monitor.width)
                    && y < f64::from(monitor.y) + f64::from(monitor.height)
            })
        })
        .or_else(|| monitors.iter().find(|monitor| monitor.primary))
        .or_else(|| monitors.first())
}

/// Captures real screen pixels before showing any selector paint or controls.
///
/// Errors retain source/permission diagnostics; no fabricated precision image is used.
pub(super) fn screen_pixels(
    monitor: &NativeMonitorInfo,
    monitors: &[NativeMonitorInfo],
) -> Result<MonitorCapture, String> {
    #[cfg(not(target_os = "linux"))]
    let _ = monitors;
    let sources = beam_screen::list_sources().map_err(|error| error.to_string())?;
    #[cfg(target_os = "linux")]
    if sources
        .iter()
        .any(|source| source.id.as_str() == "portal:monitor")
    {
        // ScreenCast provides silent native pixels. Its application-scoped
        // restore grant lets recording reuse this monitor selection.
        let capture = capture_frame_with_geometry(&ScreenshotRequest {
            screen: ScreenSelection::Portal {
                kind: beam_screen::model::PortalSourceKind::Monitor,
                restore_token: None,
            },
            region: None,
            output: Default::default(),
            excluded_window_handles: Vec::new(),
        })
        .map_err(|error| format!("Cannot authorize region precision pixels: {error}"))?;
        let granted = granted_monitor(&capture, monitors)?;
        return Ok(MonitorCapture {
            source_id: "portal:monitor".into(),
            monitor: granted.clone(),
            pixels: pixels(&capture.frame)?,
        });
    }
    let mut selected = None;
    for source in sources.into_iter().filter(|source| {
        source.kind == SourceKind::Display && !source.id.as_str().starts_with("portal:")
    }) {
        let bounds = window_bounds(&source.id).map_err(|error| error.to_string())?;
        // ScreenCaptureKit bounds are points; winit's monitor coordinates are physical.
        let scale = if cfg!(target_os = "macos") {
            monitor.scale_factor
        } else {
            1.0
        };
        if (f64::from(bounds.x) * scale).round() as i32 == monitor.x
            && (f64::from(bounds.y) * scale).round() as i32 == monitor.y
            && (f64::from(bounds.width) * scale).round() as u32 == monitor.width
            && (f64::from(bounds.height) * scale).round() as u32 == monitor.height
        {
            selected = Some(source.id);
            break;
        }
    }
    let id = selected.ok_or("The selected monitor has no matching native capture source.")?;
    let frame = capture_frame(&ScreenshotRequest {
        screen: ScreenSelection::Source {
            source_id: id.clone(),
        },
        region: None,
        output: Default::default(),
        excluded_window_handles: Vec::new(),
    })
    .map_err(|error| format!("Cannot capture region precision pixels: {error}"))?;
    Ok(MonitorCapture {
        source_id: id.to_string(),
        monitor: monitor.clone(),
        pixels: pixels_for_monitor(&frame, monitor)?,
    })
}

/// Accepts only the chosen monitor's physical raster; DPI never rescales its pixels.
pub(super) fn pixels_for_monitor(
    frame: &beam_screen::screen::OwnedVideoFrame,
    monitor: &NativeMonitorInfo,
) -> Result<ScreenPixels, String> {
    if frame.width != monitor.width || frame.height != monitor.height {
        return Err(format!(
            "Native monitor capture has changed dimensions (expected {} × {}, received {} × {}).",
            monitor.width, monitor.height, frame.width, frame.height
        ));
    }
    pixels(frame)
}

/// Preserves the authorized raster exactly; compositor geometry never resizes it.
fn pixels(frame: &beam_screen::screen::OwnedVideoFrame) -> Result<ScreenPixels, String> {
    let rgba = beam_screen::rgba_pixels(frame)
        .map_err(|error| error.to_string())?
        .into();
    Ok(ScreenPixels {
        width: frame.width,
        height: frame.height,
        rgba,
    })
}
