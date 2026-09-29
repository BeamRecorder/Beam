use super::capture::monitor_for_window;
use argui_platform::{WindowBackend, WindowKey};
use argui_runtime::{NativeMonitorInfo, NativeWindowInfo};

fn info() -> NativeWindowInfo {
    NativeWindowInfo {
        window: WindowKey::main(),
        title: String::new(),
        width: 200.0,
        height: 100.0,
        x: Some(-800.0),
        y: Some(100.0),
        visible: Some(false),
        decorations: false,
        transparent: true,
        backdrop: None,
        backdrop_available: false,
        scale_factor: 2.0,
        ui_zoom_factor: 1.0,
        capabilities: WindowBackend::X11.capabilities(),
    }
}

fn monitors() -> Vec<NativeMonitorInfo> {
    vec![
        NativeMonitorInfo {
            name: Some("Secondary".into()),
            x: -1600,
            y: 200,
            width: 1600,
            height: 1200,
            scale_factor: 2.0,
            primary: false,
        },
        NativeMonitorInfo {
            name: Some("Primary".into()),
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            scale_factor: 1.0,
            primary: true,
        },
    ]
}

#[test]
fn monitor_for_window_uses_physical_coordinates_at_mixed_dpi_and_negative_origins() {
    let choices = monitors();
    assert_eq!(monitor_for_window(&info(), &choices), choices.first());
}

#[test]
fn monitor_for_window_uses_half_open_bounds_at_the_monitor_seam() {
    let choices = monitors();
    let mut info = info();
    info.x = Some(-100.0);
    assert_eq!(monitor_for_window(&info, &choices), choices.get(1));
}

#[test]
fn monitor_for_window_handles_missing_positions_offscreen_huds_and_no_displays() {
    let mut choices = monitors();
    let mut info = info();
    for x in [None, Some(100_000.0)] {
        info.x = x;
        assert_eq!(monitor_for_window(&info, &choices), choices.get(1));
    }
    choices[1].primary = false;
    assert_eq!(monitor_for_window(&info, &choices), choices.first());
    assert!(monitor_for_window(&info, &[]).is_none());
}

fn frame(width: u32, height: u32, stride: u32, bytes: usize) -> beam_screen::screen::OwnedVideoFrame {
    beam_screen::screen::OwnedVideoFrame { width, height, stride: stride as usize, pixel_format: beam_screen::screen::PixelFormat::Bgra8, pixels: std::sync::Arc::from(vec![7; bytes]) }
}

#[test]
fn precision_frame_preserves_native_pixels_at_fractional_dpi() {
    let monitor = NativeMonitorInfo { width: 2, height: 2, scale_factor: 1.75, ..monitors()[0].clone() };
    let pixels = super::capture::pixels_for_monitor(&frame(2, 2, 8, 16), &monitor).unwrap();
    assert_eq!((pixels.width, pixels.height), (2, 2));
    assert_eq!(pixels.rgba.len(), 16);
    assert_eq!(&pixels.rgba[..3], &[7, 7, 7]);
}

#[test]
fn precision_frame_rejects_scaled_or_different_monitor_dimensions() {
    let monitor = NativeMonitorInfo { width: 2, height: 2, ..monitors()[0].clone() };
    for (width, height) in [(1, 2), (2, 1), (4, 4)] {
        assert!(super::capture::pixels_for_monitor(&frame(width, height, width * 4, (width * height * 4) as usize), &monitor).is_err());
    }
}

#[test]
fn precision_frame_rejects_truncated_rows_and_short_buffers() {
    let monitor = NativeMonitorInfo { width: 2, height: 2, ..monitors()[0].clone() };
    for raster in [frame(2, 2, 4, 16), frame(2, 2, 8, 4)] {
        assert!(super::capture::pixels_for_monitor(&raster, &monitor).is_err());
    }
}
