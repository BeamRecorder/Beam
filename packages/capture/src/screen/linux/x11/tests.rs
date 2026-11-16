use super::{
    eligible_session,
    pixels::{Layout, decode, fit, fit_rect},
};

fn layout(bits: u8) -> Layout {
    Layout {
        bits,
        pad: 32,
        little_endian: true,
        red: 0xff0000,
        green: 0xff00,
        blue: 0xff,
    }
}
#[test]
fn selects_only_local_x11_sessions() {
    assert!(eligible_session("x11", "", ":0"));
    assert!(eligible_session("X11", "", "unix:3"));
    assert!(eligible_session("", "", ":1"));
}
#[test]
fn never_uses_xwayland_as_a_wayland_desktop() {
    assert!(!eligible_session("wayland", "", ":0"));
    assert!(!eligible_session("wayland", "wayland-0", ":0"));
    assert!(!eligible_session("", "wayland-0", ":0"));
    assert!(!eligible_session("x11", "wayland-0", ":0"));
}
#[test]
fn rejects_missing_or_remote_displays() {
    for display in ["", "host:0", "localhost:10", "192.0.2.1:0"] {
        assert!(!eligible_session("x11", "", display));
    }
}
#[test]
fn decodes_bgra_and_forces_opaque_video_alpha() -> Result<(), crate::CaptureError> {
    let frame = decode(&[30, 20, 10, 0, 60, 50, 40, 128], 2, 1, layout(32))?;
    assert_eq!(&*frame.pixels, &[30, 20, 10, 255, 60, 50, 40, 255]);
    assert_eq!(frame.stride, 8);
    Ok(())
}
#[test]
fn honors_padded_rows_and_big_endian_pixels() -> Result<(), crate::CaptureError> {
    let mut value = layout(24);
    value.little_endian = false;
    let frame = decode(&[10, 20, 30, 99, 40, 50, 60, 99], 1, 2, value)?;
    assert_eq!(&*frame.pixels, &[30, 20, 10, 255, 60, 50, 40, 255]);
    Ok(())
}
#[test]
fn converts_rgb565_and_ten_bit_visuals() -> Result<(), crate::CaptureError> {
    let value = Layout {
        bits: 16,
        red: 0xf800,
        green: 0x7e0,
        blue: 0x1f,
        ..layout(16)
    };
    assert_eq!(
        &*decode(&[0, 248, 0, 0], 1, 1, value)?.pixels,
        &[0, 0, 255, 255]
    );
    let value = Layout {
        red: 0x3ff00000,
        green: 0xffc00,
        blue: 0x3ff,
        ..layout(32)
    };
    assert_eq!(
        &*decode(&0x3fffffff_u32.to_le_bytes(), 1, 1, value)?.pixels,
        &[255; 4]
    );
    Ok(())
}
#[test]
fn rejects_torn_invalid_and_oversized_images_before_allocating() {
    assert!(decode(&[0; 3], 1, 1, layout(32)).is_err());
    assert!(decode(&[], 0, 5, layout(32)).is_err());
    assert!(decode(&[], u32::MAX, u32::MAX, layout(32)).is_err());
    assert!(decode(&[0; 4], 1, 1, layout(8)).is_err());
    assert!(
        decode(
            &[0; 4],
            1,
            1,
            Layout {
                red: 0,
                ..layout(32)
            }
        )
        .is_err()
    );
}
#[test]
fn preserves_output_geometry_and_opaque_letterboxing_on_resize() -> Result<(), crate::CaptureError>
{
    assert_eq!(fit_rect(4, 2, 2, 2), (0, 0, 2, 1));
    assert_eq!(fit_rect(2, 4, 2, 2), (0, 0, 1, 2));
    let frame = decode(&[7, 8, 9, 255].repeat(8), 4, 2, layout(32))?;
    let fitted = fit(frame, 2, 2);
    assert_eq!((fitted.width, fitted.height), (2, 2));
    assert_eq!(&fitted.pixels[..8], &[7, 8, 9, 255, 7, 8, 9, 255]);
    assert_eq!(&fitted.pixels[8..], &[0, 0, 0, 255, 0, 0, 0, 255]);
    let direct = fit(fitted.clone(), 2, 2);
    assert!(std::sync::Arc::ptr_eq(&direct.pixels, &fitted.pixels));
    Ok(())
}
