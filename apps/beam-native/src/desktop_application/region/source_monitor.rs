//! Maps an authorized portal source into the overlay backend's desktop space.

use argui_runtime::NativeMonitorInfo;
use beam_screen::screen::{CapturedScreenFrame, ScreenSourceGeometry};

/// Resolves the granted monitor, including a monitor other than the launcher's.
///
/// XWayland can report compositor-sized monitors while PipeWire delivers a
/// higher-resolution raster. Only an unambiguous geometry match is accepted.
pub(super) fn granted_monitor<'a>(
    capture: &CapturedScreenFrame,
    monitors: &'a [NativeMonitorInfo],
) -> Result<&'a NativeMonitorInfo, String> {
    let geometry = capture.geometry.unwrap_or_default();
    let raster = (capture.frame.width, capture.frame.height);
    let mut matches = monitors
        .iter()
        .filter(|monitor| matches_source(monitor, geometry, raster, monitors.len() == 1));
    match (matches.next(), matches.next()) {
        (Some(monitor), None) => Ok(monitor),
        (Some(_), Some(_)) => Err(
            "The granted screen matches multiple monitors; its portal geometry is ambiguous."
                .into(),
        ),
        (None, _) => Err(format!(
            "Cannot locate the authorized screen on this desktop (stream {} × {}, compositor {:?} at {:?}).",
            raster.0, raster.1, geometry.size, geometry.position
        )),
    }
}

/// Compares complete coordinate spaces rather than equating displayed and pixel sizes.
fn matches_source(
    monitor: &NativeMonitorInfo,
    geometry: ScreenSourceGeometry,
    raster: (u32, u32),
    single: bool,
) -> bool {
    if monitor.width == 0
        || monitor.height == 0
        || raster.0 == 0
        || raster.1 == 0
        || !monitor.scale_factor.is_finite()
        || monitor.scale_factor <= 0.0
    {
        return false;
    }
    let size = geometry.size.unwrap_or(raster);
    if size.0 == 0
        || size.1 == 0
        || !same_aspect((monitor.width, monitor.height), size)
        || !same_aspect(size, raster)
    {
        return false;
    }
    if let Some(position) = geometry.position {
        let scale = f64::from(monitor.width) / f64::from(size.0);
        return [1.0, monitor.scale_factor, scale].into_iter().any(|scale| {
            near(f64::from(monitor.x) / scale, f64::from(position.0))
                && near(f64::from(monitor.y) / scale, f64::from(position.1))
                && near(f64::from(monitor.width) / scale, f64::from(size.0))
                && near(f64::from(monitor.height) / scale, f64::from(size.1))
        });
    }
    single
        || [1.0, monitor.scale_factor].into_iter().any(|scale| {
            near(f64::from(monitor.width) / scale, f64::from(size.0))
                && near(f64::from(monitor.height) / scale, f64::from(size.1))
        })
}

/// Allows one pixel of rounding when a compositor uses fractional scaling.
fn same_aspect(a: (u32, u32), b: (u32, u32)) -> bool {
    let expected = f64::from(a.0) * f64::from(b.1) / f64::from(a.1);
    (expected - f64::from(b.0)).abs() <= 1.0
}

/// Portal positions and sizes can round by one compositor coordinate.
fn near(a: f64, b: f64) -> bool {
    (a - b).abs() <= 1.0
}
