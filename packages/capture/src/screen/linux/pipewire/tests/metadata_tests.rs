use super::*;
use pipewire::spa::{param::video::VideoFormat, sys};

#[repr(C)]
struct CursorBlob {
    cursor: sys::spa_meta_cursor,
    bitmap: sys::spa_meta_bitmap,
    pixels: [u8; 16],
}
impl CursorBlob {
    fn new() -> Self {
        // SPA structures contain only integers; the bitmap lives directly after the cursor header.
        let mut blob: Self = unsafe { std::mem::zeroed() };
        blob.cursor.id = 1;
        blob.cursor.bitmap_offset = size_of::<sys::spa_meta_cursor>() as u32;
        blob.bitmap.format = VideoFormat::RGBA.0;
        blob.bitmap.size.width = 2;
        blob.bitmap.size.height = 2;
        blob.bitmap.stride = 8;
        blob.bitmap.offset = size_of::<sys::spa_meta_bitmap>() as u32;
        blob.pixels.fill(255);
        blob
    }
    fn meta(&self) -> &MetaCursor {
        // libspa's MetaCursor is repr(transparent) over spa_meta_cursor.
        unsafe { &*(&self.cursor as *const sys::spa_meta_cursor).cast::<MetaCursor>() }
    }
}

#[test]
fn zero_bitmap_data_offset_explicitly_hides_the_previous_cursor() {
    let mut blob = CursorBlob::new();
    blob.bitmap.offset = 0;
    assert_eq!(
        cursor_shape(blob.meta(), &mut CursorClassifier::system()).map(|shape| shape.0),
        Some(HIDDEN_CURSOR_SHAPE_ID)
    );
    assert!(valid_bitmap(blob.meta()).is_none());
}

#[test]
fn missing_or_invalid_bitmap_headers_do_not_change_the_current_cursor() {
    let mut blob = CursorBlob::new();
    for offset in [0, 1, CURSOR_META_SIZE as u32, u32::MAX] {
        blob.cursor.bitmap_offset = offset;
        assert!(bitmap_header(blob.meta()).is_none());
    }
    blob.cursor.bitmap_offset = size_of::<sys::spa_meta_cursor>() as u32;
    blob.bitmap.format = 0;
    blob.bitmap.offset = 0;
    assert!(cursor_shape(blob.meta(), &mut CursorClassifier::system()).is_none());
    blob.cursor.id = 0;
    assert!(bitmap_header(blob.meta()).is_none());
}

#[test]
fn bitmap_payload_bounds_are_validated_before_reading_pixels() {
    let mut blob = CursorBlob::new();
    assert_eq!(
        valid_bitmap(blob.meta()).and_then(|bitmap| bitmap.bitmap_data()),
        Some(&[255; 16][..])
    );
    blob.bitmap.offset = u32::MAX;
    assert!(valid_bitmap(blob.meta()).is_none());
    blob.bitmap.offset = size_of::<sys::spa_meta_bitmap>() as u32;
    blob.bitmap.size.width = 385;
    assert!(valid_bitmap(blob.meta()).is_none());
    blob.bitmap.size.width = 2;
    blob.bitmap.stride = 4;
    assert!(valid_bitmap(blob.meta()).is_none());
}
