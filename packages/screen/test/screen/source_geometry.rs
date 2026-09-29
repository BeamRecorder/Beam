use beam_screen::screen::{
    CapturedScreenFrame, OwnedVideoFrame, PixelFormat, ScreenSourceGeometry,
};
use std::sync::Arc;

#[test]
fn compositor_geometry_and_capture_pixels_have_independent_dimensions() {
    let frame = CapturedScreenFrame {
        frame: OwnedVideoFrame {
            width: 3840,
            height: 2160,
            stride: 3840 * 4,
            pixel_format: PixelFormat::Bgra8,
            pixels: [].into(),
        },
        geometry: Some(ScreenSourceGeometry {
            position: Some((-1920, 0)),
            size: Some((1920, 1080)),
        }),
    };
    assert_eq!(frame.geometry.unwrap().position, Some((-1920, 0)));
    assert_eq!(frame.geometry.unwrap().size, Some((1920, 1080)));
    assert_eq!((frame.frame.width, frame.frame.height), (3840, 2160));
}

#[test]
fn optional_source_geometry_keeps_missing_portal_properties_absent() {
    let geometry = ScreenSourceGeometry::default();
    assert_eq!(geometry.position, None);
    assert_eq!(geometry.size, None);
    let copied = geometry;
    assert_eq!(geometry, copied);
}

#[test]
fn cloning_a_capture_shares_the_original_raster_and_retains_its_geometry() {
    let frame = CapturedScreenFrame {
        frame: OwnedVideoFrame {
            width: 1,
            height: 1,
            stride: 4,
            pixel_format: PixelFormat::Bgra8,
            pixels: [1, 2, 3, 255].into(),
        },
        geometry: None,
    };
    let cloned = frame.clone();
    assert_eq!(cloned, frame);
    assert!(Arc::ptr_eq(&cloned.frame.pixels, &frame.frame.pixels));
    assert_eq!(cloned.geometry, None);
}
