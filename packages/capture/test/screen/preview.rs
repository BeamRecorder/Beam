#![cfg(test)]

use super::*;

#[test]
#[cfg(target_os = "macos")]
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
#[cfg(target_os = "macos")]
fn encodes_valid_rgba_as_a_jpeg_data_url_and_rejects_wrong_lengths() {
    let result = jpeg_data_url(&[255, 64, 0, 255], 1, 1);
    assert!(result.is_ok(), "one RGBA pixel should encode");
    let encoded = result.unwrap_or_default();
    assert!(encoded.starts_with("data:image/jpeg;base64,/9j/"));
    assert!(jpeg_data_url(&[], 1, 1).is_err());
    assert!(jpeg_data_url(&[0; 8], 1, 1).is_err());
}
