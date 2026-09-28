#![cfg(test)]
#![allow(clippy::unwrap_used)]
use super::bgra;

#[test]
fn packed_pixels_become_opaque_engine_frames() {
    assert_eq!(
        bgra(&[1, 2, 3, 0], 1, 1, 32, 32, true).unwrap(),
        [1, 2, 3, 255]
    );
    assert_eq!(
        bgra(&[0, 3, 2, 1], 1, 1, 32, 32, false).unwrap(),
        [1, 2, 3, 255]
    );
}
#[test]
fn padded_24_bit_rows_and_big_endian_pixels_are_decoded() {
    assert_eq!(
        bgra(&[1, 2, 3, 0, 4, 5, 6, 0], 1, 2, 24, 32, true).unwrap(),
        [1, 2, 3, 255, 4, 5, 6, 255]
    );
    assert_eq!(
        bgra(&[3, 2, 1, 0], 1, 1, 24, 32, false).unwrap(),
        [1, 2, 3, 255]
    );
}
#[test]
fn invalid_layouts_lengths_and_large_frames_are_rejected() {
    assert!(bgra(&[], 0, 1, 32, 32, true).is_err());
    assert!(bgra(&[], 1, 1, 16, 32, true).is_err());
    assert!(bgra(&[], 1, 1, 32, 7, true).is_err());
    assert!(bgra(&[0; 3], 1, 1, 32, 32, true).is_err());
    assert!(bgra(&[], u32::MAX, u32::MAX, 32, 32, true).is_err());
}
