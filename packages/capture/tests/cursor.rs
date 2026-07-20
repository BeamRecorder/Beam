#![allow(clippy::expect_used)]

use capture::cursor::*;

#[test]
fn coordinates_support_negative_origins_and_crop() {
    let point = map_coordinates(
        -50,
        25,
        CaptureRegion {
            x: -100,
            y: 0,
            width: 200,
            height: 100,
        },
    )
    .expect("coordinates");
    assert_eq!((point.pixel_x, point.pixel_y), (50, 25));
    assert_eq!((point.normalized_x, point.normalized_y), (0.25, 0.25));
    assert!(point.inside);
}

#[test]
fn shapes_are_deduplicated_with_hotspot_in_hash() {
    let temp = tempfile::tempdir().expect("tempdir");
    let mut store = ShapeStore::new(temp.path()).expect("store");
    let rgba = [255_u8, 0, 0, 255];
    let first = store
        .store(CursorBitmap {
            width: 1,
            height: 1,
            rgba: &rgba,
            hotspot: Hotspot { x: 0, y: 0 },
        })
        .expect("shape");
    let second = store
        .store(CursorBitmap {
            width: 1,
            height: 1,
            rgba: &rgba,
            hotspot: Hotspot { x: 0, y: 0 },
        })
        .expect("shape");
    assert_eq!(first, second);
    assert_eq!(store.len(), 1);
}
