pub fn validate_dimensions(width: u32, height: u32) -> Result<(), crate::CaptureError> {
    if width == 0 || height == 0 || width > 16_384 || height > 16_384 {
        return Err(crate::CaptureError::InvalidConfiguration(
            "dimensions must be within 1..=16384".into(),
        ));
    }
    Ok(())
}
