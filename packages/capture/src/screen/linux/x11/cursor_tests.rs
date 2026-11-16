use super::blend_cursor;
use crate::{
    CaptureError,
    screen::linux::x11::pixels::{Layout, decode},
};
fn frame() -> Result<crate::screen::OwnedVideoFrame, CaptureError> {
    decode(
        &[100, 100, 100, 255].repeat(4),
        2,
        2,
        Layout {
            bits: 32,
            pad: 32,
            little_endian: true,
            red: 0xff0000,
            green: 0xff00,
            blue: 0xff,
        },
    )
}
#[test]
fn composites_premultiplied_cursor_alpha_and_preserves_video_alpha() -> Result<(), CaptureError> {
    let mut frame = frame()?;
    blend_cursor(&mut frame, 0, 0, 1, &[20, 10, 0, 128]);
    assert_eq!(&frame.pixels[..4], &[69, 59, 49, 255]);
    Ok(())
}
#[test]
fn clips_negative_hotspots_to_capture_edges() -> Result<(), CaptureError> {
    let mut frame = frame()?;
    blend_cursor(&mut frame, -1, -1, 2, &[0, 0, 255, 255].repeat(4));
    assert_eq!(&frame.pixels[..4], &[0, 0, 255, 255]);
    assert_eq!(&frame.pixels[4..], &[100, 100, 100, 255].repeat(3));
    Ok(())
}
#[test]
fn ignores_empty_offscreen_and_transparent_cursors() -> Result<(), CaptureError> {
    let mut frame = frame()?;
    let clean = frame.pixels.clone();
    blend_cursor(&mut frame, 0, 0, 0, &[255; 4]);
    blend_cursor(&mut frame, 2, 2, 1, &[255; 4]);
    blend_cursor(&mut frame, 0, 0, 1, &[0; 4]);
    assert_eq!(frame.pixels, clean);
    Ok(())
}
