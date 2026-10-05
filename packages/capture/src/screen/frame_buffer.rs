use crate::CaptureError;
use std::borrow::Cow;

/// Preserve the initial recording dimensions when a captured window shrinks.
/// Normal frames borrow their existing pixels; only resized frames allocate.
pub(crate) fn pad_bgra_frame(
    bytes: &[u8],
    width: u32,
    height: u32,
    target_width: u32,
    target_height: u32,
) -> Result<Cow<'_, [u8]>, CaptureError> {
    let size = |width: u32, height: u32| {
        (width as usize)
            .checked_mul(height as usize)
            .and_then(|pixels| pixels.checked_mul(4))
            .filter(|bytes| *bytes > 0)
    };
    let invalid = || {
        CaptureError::Backend("captured BGRA frame has invalid dimensions or byte layout".into())
    };
    let source_size = size(width, height).ok_or_else(invalid)?;
    let target_size = size(target_width, target_height).ok_or_else(invalid)?;
    if bytes.len() < source_size || width > target_width || height > target_height {
        return Err(invalid());
    }
    if width == target_width && height == target_height {
        return Ok(Cow::Borrowed(&bytes[..source_size]));
    }
    let mut padded = vec![0; target_size];
    for pixel in padded.as_chunks_mut::<4>().0 {
        pixel[3] = 255;
    }
    let source_stride = width as usize * 4;
    let target_stride = target_width as usize * 4;
    for (row, pixels) in bytes[..source_size].chunks_exact(source_stride).enumerate() {
        let start = row * target_stride;
        padded[start..start + source_stride].copy_from_slice(pixels);
    }
    Ok(Cow::Owned(padded))
}

pub(crate) fn flip_bgra_rows(bytes: &[u8], width: u32, height: u32) -> Vec<u8> {
    let row_bytes = width as usize * 4;
    let row_count = height as usize;
    let mut flipped = Vec::with_capacity(bytes.len());
    for row in (0..row_count).rev() {
        let start = row * row_bytes;
        flipped.extend_from_slice(&bytes[start..start + row_bytes]);
    }
    flipped
}

#[cfg(test)]
mod tests {
    #![allow(clippy::expect_used)]
    use super::*;

    #[test]
    fn normal_frames_borrow_pixels_without_another_copy() {
        let pixels = vec![1; 16];
        assert!(matches!(
            pad_bgra_frame(&pixels, 2, 2, 2, 2).expect("frame"),
            Cow::Borrowed(_)
        ));
    }

    #[test]
    fn shrunk_windows_pad_the_right_and_bottom_edges_with_opaque_black() {
        let pixels = [1, 2, 3, 255, 4, 5, 6, 255];
        let padded = pad_bgra_frame(&pixels, 1, 2, 2, 3).expect("pad");
        assert_eq!(
            &*padded,
            &[
                1, 2, 3, 255, 0, 0, 0, 255, 4, 5, 6, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255
            ]
        );
        assert_eq!(
            &flip_bgra_rows(&padded, 2, 3)[..8],
            &[0, 0, 0, 255, 0, 0, 0, 255]
        );
    }

    #[test]
    fn malformed_frames_fail_before_allocating_or_copying() {
        assert!(pad_bgra_frame(&[0; 3], 1, 1, 2, 2).is_err());
        assert!(pad_bgra_frame(&[], 0, 1, 2, 2).is_err());
        assert!(pad_bgra_frame(&[0; 16], 2, 2, 1, 1).is_err());
        assert!(pad_bgra_frame(&[], u32::MAX, u32::MAX, u32::MAX, u32::MAX).is_err());
    }

    #[test]
    fn flips_multiple_rows_without_reversing_pixels_within_a_row() {
        assert_eq!(
            flip_bgra_rows(&[1, 2, 3, 4, 5, 6, 7, 8], 1, 2),
            vec![5, 6, 7, 8, 1, 2, 3, 4]
        );
    }

    #[test]
    fn one_row_remains_unchanged() {
        assert_eq!(flip_bgra_rows(&[1, 2, 3, 4], 1, 1), vec![1, 2, 3, 4]);
    }

    #[test]
    fn an_empty_frame_has_no_rows_to_reverse() {
        assert!(flip_bgra_rows(&[], 0, 0).is_empty());
    }
}
