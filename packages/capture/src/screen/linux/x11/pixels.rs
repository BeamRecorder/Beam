use super::connection::error;
use crate::{
    CaptureError,
    screen::{OwnedVideoFrame, PixelFormat},
};

pub(super) const MAX_FRAME_BYTES: usize = 64 * 1024 * 1024;
#[derive(Clone, Copy)]
pub(super) struct Layout {
    pub bits: u8,
    pub pad: u8,
    pub little_endian: bool,
    pub red: u32,
    pub green: u32,
    pub blue: u32,
}
pub(super) fn decode(
    data: &[u8],
    width: u32,
    height: u32,
    layout: Layout,
) -> Result<OwnedVideoFrame, CaptureError> {
    let bytes = (width as usize)
        .checked_mul(height as usize)
        .and_then(|v| v.checked_mul(4))
        .filter(|v| *v > 0 && *v <= MAX_FRAME_BYTES)
        .ok_or_else(|| error("Frame exceeds the 64 MiB capture limit"))?;
    if ![16, 24, 32].contains(&layout.bits)
        || ![8, 16, 32].contains(&layout.pad)
        || [layout.red, layout.green, layout.blue].contains(&0)
    {
        return Err(error("Unsupported X11 pixel layout"));
    }
    let stride = (width as usize * usize::from(layout.bits)).div_ceil(usize::from(layout.pad))
        * usize::from(layout.pad)
        / 8;
    if stride
        .checked_mul(height as usize)
        .is_none_or(|required| data.len() < required)
    {
        return Err(error("Truncated X11 image"));
    }
    let mut pixels = vec![0; bytes];
    let channel = |pixel: u32, mask: u32| -> u8 {
        let mask = mask >> mask.trailing_zeros();
        ((u64::from(pixel) * 255 + u64::from(mask) / 2) / u64::from(mask)) as u8
    };
    for y in 0..height as usize {
        // The usual TrueColor layout already matches our BGRA output. Avoid
        // three channel divisions per pixel on high-resolution desktops.
        if layout.bits == 32
            && layout.little_endian
            && (layout.red, layout.green, layout.blue) == (0xff0000, 0xff00, 0xff)
        {
            let row = &mut pixels[y * width as usize * 4..(y + 1) * width as usize * 4];
            row.copy_from_slice(&data[y * stride..y * stride + row.len()]);
            for pixel in row.as_chunks_mut::<4>().0 {
                pixel[3] = 255;
            }
            continue;
        }
        for x in 0..width as usize {
            let start = y * stride + x * usize::from(layout.bits / 8);
            let input = &data[start..start + usize::from(layout.bits / 8)];
            let pixel = if layout.little_endian {
                input
                    .iter()
                    .rev()
                    .fold(0, |acc, byte| (acc << 8) | u32::from(*byte))
            } else {
                input
                    .iter()
                    .fold(0, |acc, byte| (acc << 8) | u32::from(*byte))
            };
            let offset = (y * width as usize + x) * 4;
            pixels[offset..offset + 4].copy_from_slice(&[
                channel(
                    (pixel & layout.blue) >> layout.blue.trailing_zeros(),
                    layout.blue,
                ),
                channel(
                    (pixel & layout.green) >> layout.green.trailing_zeros(),
                    layout.green,
                ),
                channel(
                    (pixel & layout.red) >> layout.red.trailing_zeros(),
                    layout.red,
                ),
                255,
            ]);
        }
    }
    Ok(OwnedVideoFrame {
        width,
        height,
        stride: width as usize * 4,
        pixel_format: PixelFormat::Bgra8,
        pixels: pixels.into(),
    })
}

/// Preserve the negotiated output size if a captured window is resized.
pub(super) fn fit(frame: OwnedVideoFrame, width: u32, height: u32) -> OwnedVideoFrame {
    if (frame.width, frame.height) == (width, height) {
        return frame;
    }
    let (left, top, fitted_width, fitted_height) =
        fit_rect(frame.width, frame.height, width, height);
    let mut pixels = vec![0; width as usize * height as usize * 4];
    for pixel in pixels.as_chunks_mut::<4>().0 {
        pixel[3] = 255;
    }
    for y in 0..fitted_height {
        for x in 0..fitted_width {
            let source_x = u64::from(x) * u64::from(frame.width) / u64::from(fitted_width);
            let source_y = u64::from(y) * u64::from(frame.height) / u64::from(fitted_height);
            let from = source_y as usize * frame.stride + source_x as usize * 4;
            let to = ((y + top) as usize * width as usize + (x + left) as usize) * 4;
            pixels[to..to + 4].copy_from_slice(&frame.pixels[from..from + 4]);
        }
    }
    OwnedVideoFrame {
        width,
        height,
        stride: width as usize * 4,
        pixel_format: PixelFormat::Bgra8,
        pixels: pixels.into(),
    }
}
pub(super) fn fit_rect(
    source_width: u32,
    source_height: u32,
    width: u32,
    height: u32,
) -> (u32, u32, u32, u32) {
    let scale = (f64::from(width) / f64::from(source_width))
        .min(f64::from(height) / f64::from(source_height));
    let w = (f64::from(source_width) * scale).round().max(1.0) as u32;
    let h = (f64::from(source_height) * scale).round().max(1.0) as u32;
    ((width - w) / 2, (height - h) / 2, w, h)
}
