use super::source_monitor::granted_monitor;
use argui_runtime::NativeMonitorInfo;
use beam_screen::screen::{
    CapturedScreenFrame, OwnedVideoFrame, PixelFormat, ScreenSourceGeometry,
};

fn monitor(x: i32, width: u32, height: u32, scale_factor: f64) -> NativeMonitorInfo {
    NativeMonitorInfo {
        name: None,
        x,
        y: 0,
        width,
        height,
        scale_factor,
        primary: x == 0,
    }
}
fn capture(
    width: u32,
    height: u32,
    position: Option<(i32, i32)>,
    size: Option<(u32, u32)>,
) -> CapturedScreenFrame {
    CapturedScreenFrame {
        frame: OwnedVideoFrame {
            width,
            height,
            stride: width as usize * 4,
            pixel_format: PixelFormat::Bgra8,
            pixels: [].into(),
        },
        geometry: Some(ScreenSourceGeometry { position, size }),
    }
}

#[test]
fn portal_raster_can_be_larger_or_smaller_than_xwayland_monitor_geometry() {
    let monitors = [monitor(0, 1920, 1080, 1.0)];
    for (width, height) in [(1920, 1080), (3840, 2160), (1280, 720), (2400, 1350)] {
        assert_eq!(
            granted_monitor(
                &capture(width, height, Some((0, 0)), Some((1920, 1080))),
                &monitors
            ),
            Ok(&monitors[0])
        );
    }
}

#[test]
fn portal_selection_can_target_a_different_monitor_and_negative_desktop_origins() {
    let monitors = [monitor(-1920, 1920, 1080, 1.0), monitor(0, 2560, 1440, 1.0)];
    for (index, position, size) in [(0, (-1920, 0), (1920, 1080)), (1, (0, 0), (2560, 1440))] {
        let stream = capture(size.0 * 2, size.1 * 2, Some(position), Some(size));
        assert_eq!(granted_monitor(&stream, &monitors), Ok(&monitors[index]));
    }
}

#[test]
fn portal_geometry_matches_uniformly_scaled_desktop_coordinates_at_fractional_dpi() {
    let monitors = [
        monitor(-2400, 2400, 1350, 1.25),
        monitor(0, 2400, 1350, 1.25),
    ];
    let stream = capture(3840, 2160, Some((-1920, 0)), Some((1920, 1080)));
    assert_eq!(granted_monitor(&stream, &monitors), Ok(&monitors[0]));
}

#[test]
fn missing_optional_metadata_accepts_only_an_unambiguous_monitor() {
    let stream = capture(3840, 2160, None, None);
    assert!(granted_monitor(&stream, &[monitor(0, 1920, 1080, 1.0)]).is_ok());
    let monitors = [monitor(0, 3840, 2160, 1.0), monitor(3840, 1280, 1024, 1.0)];
    assert_eq!(granted_monitor(&stream, &monitors), Ok(&monitors[0]));
    let identical = [monitor(0, 1920, 1080, 2.0), monitor(1920, 1920, 1080, 2.0)];
    assert!(granted_monitor(&capture(1920, 1080, None, None), &identical).is_err());
}

#[test]
fn metadata_never_silently_selects_the_launcher_monitor_when_the_source_is_unknown() {
    let monitors = [monitor(0, 1920, 1080, 1.0)];
    for stream in [
        capture(1920, 1080, Some((9999, 0)), Some((1920, 1080))),
        capture(1920, 1080, Some((0, 0)), Some((1280, 1024))),
        capture(0, 1080, None, None),
        capture(1920, 0, None, None),
        capture(1920, 1080, None, Some((0, 1080))),
    ] {
        assert!(granted_monitor(&stream, &monitors).is_err());
    }
    assert!(granted_monitor(&capture(1920, 1080, None, None), &[]).is_err());
}

#[test]
fn invalid_monitor_scales_and_mirrored_ambiguous_outputs_are_rejected() {
    let stream = capture(1920, 1080, Some((0, 0)), Some((1920, 1080)));
    for scale in [0.0, -1.0, f64::NAN, f64::INFINITY] {
        assert!(granted_monitor(&stream, &[monitor(0, 1920, 1080, scale)]).is_err());
    }
    let monitor = monitor(0, 1920, 1080, 1.0);
    assert!(
        granted_monitor(&stream, &[monitor.clone(), monitor])
            .unwrap_err()
            .contains("ambiguous")
    );
}

#[test]
fn fractional_rounding_is_bounded_and_positions_distinguish_equal_sized_outputs() {
    let monitors = [monitor(0, 1920, 1080, 1.0), monitor(1920, 1920, 1080, 1.0)];
    assert_eq!(
        granted_monitor(
            &capture(2400, 1350, Some((1920, 0)), Some((1920, 1080))),
            &monitors
        ),
        Ok(&monitors[1])
    );
    let monitors = [monitor(0, 1920, 1080, 1.0)];
    assert!(
        granted_monitor(
            &capture(2401, 1350, Some((0, 0)), Some((1920, 1080))),
            &monitors
        )
        .is_ok()
    );
    assert!(
        granted_monitor(
            &capture(2403, 1350, Some((0, 0)), Some((1920, 1080))),
            &monitors
        )
        .is_err()
    );
}
