#![cfg(test)]

use super::*;

#[test]
fn fits_landscape_portrait_and_small_sources_without_distortion() {
    assert_eq!(fit_preview_dimensions(1920, 1080, 300, 200), (300, 169));
    assert_eq!(fit_preview_dimensions(1080, 1920, 300, 200), (113, 200));
    assert_eq!(fit_preview_dimensions(120, 80, 300, 200), (120, 80));
}

#[test]
fn rejects_zero_and_oversized_preview_bounds() {
    assert!(validate_preview_bounds(0, 200).is_err());
    assert!(validate_preview_bounds(300, 0).is_err());
    assert!(validate_preview_bounds(641, 200).is_err());
    assert!(validate_preview_bounds(300, 361).is_err());
}

#[test]
fn encodes_valid_rgba_as_a_jpeg_data_url_and_rejects_wrong_lengths() {
    let result = jpeg_data_url(&[255, 64, 0, 255], 1, 1);
    assert!(result.is_ok(), "one RGBA pixel should encode");
    let encoded = result.unwrap_or_default();
    assert!(encoded.starts_with("data:image/jpeg;base64,/9j/"));
    assert!(jpeg_data_url(&[], 1, 1).is_err());
    assert!(jpeg_data_url(&[0; 8], 1, 1).is_err());
}
#[test]
fn thumbnail_scaling_validates_lengths_and_overflow_before_allocating() {
    for (width, height) in [(0, 1), (1, 0), (u32::MAX, u32::MAX), (10, 10)] {
        assert!(rgba_thumbnail(&[], width, height, 8, 8).is_err());
    }
    let pixels = vec![120; 16 * 8 * 4];
    assert!(
        rgba_thumbnail(&pixels, 16, 8, 4, 4)
            .unwrap_or_default()
            .starts_with("data:image/jpeg;base64,/9j/")
    );
    assert!(rgba_thumbnail(&pixels, 16, 8, 0, 4).is_err());
    assert!(jpeg_data_url(&[], u32::MAX, u32::MAX).is_err());
    assert!(jpeg_data_url(&[], 65_536, 0).is_err());
    assert!(jpeg_data_url(&[], 0, 65_536).is_err());
    let id = SourceId::new("portal:monitor").unwrap_or_else(|_| unreachable!());
    assert!(capture_source_preview(&id, 0, 0).is_err());
}
