use crate::CaptureError;

/// ScreenCaptureKit filter geometry is in points; encoder dimensions are pixels.
pub(super) fn window_pixel_dimensions(
    width: f64,
    height: f64,
    scale: f64,
) -> Result<(u32, u32), CaptureError> {
    let pixels = [width * scale, height * scale];
    if !scale.is_finite()
        || scale <= 0.0
        || pixels
            .iter()
            .any(|value| !value.is_finite() || *value < 2.0 || *value > f64::from(u32::MAX))
    {
        return Err(CaptureError::InvalidConfiguration(
            "macOS window capture requires valid pixel dimensions and display scale".into(),
        ));
    }
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let dimensions = pixels.map(|value| (value.ceil() as u32) & !1);
    Ok((dimensions[0], dimensions[1]))
}

#[cfg(test)]
mod tests {
    use super::window_pixel_dimensions;
    use crate::CaptureError;

    #[test]
    fn retina_retains_backing_pixels() -> Result<(), CaptureError> {
        assert_eq!(window_pixel_dimensions(1280.0, 720.0, 2.0)?, (2560, 1440));
        Ok(())
    }

    #[test]
    fn external_display_retains_native_resolution() -> Result<(), CaptureError> {
        assert_eq!(window_pixel_dimensions(2560.0, 1440.0, 1.0)?, (2560, 1440));
        Ok(())
    }

    #[test]
    fn fractional_geometry_produces_even_encoder_dimensions() -> Result<(), CaptureError> {
        assert_eq!(window_pixel_dimensions(801.5, 601.5, 2.0)?, (1602, 1202));
        Ok(())
    }

    #[test]
    fn rejects_invalid_geometry_and_scale() {
        for (width, height, scale) in [
            (0.0, 720.0, 2.0),
            (1280.0, -1.0, 2.0),
            (1280.0, 720.0, 0.0),
            (1280.0, 720.0, -2.0),
            (f64::NAN, 720.0, 2.0),
            (1280.0, 720.0, f64::INFINITY),
            (f64::from(u32::MAX), 720.0, 2.0),
        ] {
            assert!(window_pixel_dimensions(width, height, scale).is_err());
        }
    }
}
