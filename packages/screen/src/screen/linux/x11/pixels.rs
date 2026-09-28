//! Validated X11 pixel decoding at the native capture boundary.

use crate::CaptureError;

/// Converts packed TrueColor pixels to the engine's opaque BGRA format.
pub(crate) fn bgra(
    data: &[u8],
    width: u32,
    height: u32,
    bits: u8,
    pad: u8,
    little_endian: bool,
) -> Result<Vec<u8>, CaptureError> {
    if width == 0 || height == 0 || !matches!(bits, 24 | 32) || !matches!(pad, 8 | 16 | 32) {
        return Err(CaptureError::Unsupported(
            "X11 capture requires 24/32-bit TrueColor pixels".into(),
        ));
    }
    let pixels = u64::from(width) * u64::from(height);
    if pixels > 64 * 1024 * 1024 {
        return Err(CaptureError::InvalidConfiguration(
            "X11 frame exceeds 256 MiB".into(),
        ));
    }
    let row_bytes =
        (u64::from(width) * u64::from(bits)).div_ceil(u64::from(pad)) * u64::from(pad) / 8;
    if u64::try_from(data.len()).ok() != Some(row_bytes * u64::from(height)) {
        return Err(CaptureError::Backend(
            "X11 frame byte length does not match its geometry".into(),
        ));
    }
    let stride = row_bytes as usize;
    let bytes_per_pixel = usize::from(bits / 8);
    let mut output = Vec::with_capacity(pixels as usize * 4);
    for y in 0..height as usize {
        for x in 0..width as usize {
            let offset = y * stride + x * bytes_per_pixel;
            let pixel = &data[offset..offset + bytes_per_pixel];
            let (b, g, r) = if little_endian {
                (pixel[0], pixel[1], pixel[2])
            } else {
                let start = bytes_per_pixel - 3;
                (pixel[start + 2], pixel[start + 1], pixel[start])
            };
            output.extend_from_slice(&[b, g, r, 255]);
        }
    }
    Ok(output)
}

#[path = "../../../../test/screen/linux/x11/pixels.rs"]
mod checks;
