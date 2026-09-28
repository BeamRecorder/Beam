#![cfg(test)]
#![allow(clippy::unwrap_used)]
use super::{Reader, Selection, blend_cursor, kind};
use crate::cursor::CursorKind;

#[test]
fn real_cursor_names_use_the_editors_cursor_vocabulary() {
    assert_eq!(kind("xterm"), CursorKind::Textcursor);
    assert_eq!(kind("hand2"), CursorKind::Handpointing);
    assert_eq!(kind("left_ptr"), CursorKind::Default);
}
#[test]
fn premultiplied_cursor_pixels_blend_without_touching_other_pixels() {
    let mut pixels = vec![100; 8];
    blend_cursor(&mut pixels, (2, 1), 0, 0, 1, 1, &[0x80000080]);
    assert_eq!(&pixels[..3], &[177, 49, 49]);
    assert_eq!(&pixels[4..], &[100; 4]);
}
#[test]
fn cursor_outside_frame_and_truncated_cursor_data_are_safe() {
    let mut pixels = vec![100; 4];
    blend_cursor(&mut pixels, (1, 1), -2, -2, 1, 1, &[u32::MAX]);
    blend_cursor(&mut pixels, (1, 1), 0, 0, 2, 2, &[]);
    assert_eq!(pixels, vec![100; 4]);
}

#[test]
#[ignore = "requires the private X11 display"]
fn a_window_frame_uses_its_real_offscreen_pixels_and_normalized_crop() {
    use super::super::checks::Fixture;
    use crate::model::{CursorSelection, ScreenRegion};
    let fixture = Fixture::new(0xff0000);
    let mut reader = Reader::open(
        Selection::Window(fixture.window),
        Some(ScreenRegion {
            x: 0.25,
            y: 0.25,
            width: 0.5,
            height: 0.5,
        }),
    )
    .unwrap();
    let _cover = Fixture::new(0x0000ff);
    let (frame, _) = reader.frame(CursorSelection::Disabled).unwrap();
    assert_eq!((frame.width, frame.height), (80, 60));
    assert!(
        frame
            .pixels
            .as_chunks::<4>()
            .0
            .iter()
            .all(|pixel| *pixel == [0, 0, 255, 255])
    );
}
