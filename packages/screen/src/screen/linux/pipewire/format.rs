use std::sync::Arc;

use crate::{
    CaptureError, NativeCaptureErrorCode,
    screen::{OwnedVideoFrame, PixelFormat, VideoFormat},
};

pub(crate) const MAX_VIDEO_DIMENSION: u32 = 16_384;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum NativePixelFormat {
    Bgrx,
    Bgra,
    Rgbx,
    Rgba,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct NegotiatedFormat {
    pub width: u32,
    pub height: u32,
    pub pixel_format: NativePixelFormat,
}

impl NegotiatedFormat {
    pub(crate) fn new(
        width: u32,
        height: u32,
        pixel_format: NativePixelFormat,
    ) -> Result<Self, CaptureError> {
        if width == 0 || height == 0 || width > MAX_VIDEO_DIMENSION || height > MAX_VIDEO_DIMENSION
        {
            return Err(buffer_error(format!(
                "invalid negotiated video dimensions {width}x{height}"
            )));
        }
        width
            .checked_mul(height)
            .and_then(|pixels| pixels.checked_mul(4))
            .ok_or_else(|| buffer_error("negotiated video size overflows"))?;
        Ok(Self {
            width,
            height,
            pixel_format,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CropRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) enum VideoTransform {
    #[default]
    None,
    Rotated90,
    Rotated180,
    Rotated270,
    Flipped,
    Flipped90,
    Flipped180,
    Flipped270,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct BufferLayout {
    pub offset: usize,
    pub size: usize,
    pub stride: i32,
    pub crop: Option<CropRect>,
    pub transform: VideoTransform,
}

pub(crate) fn copy_frame(
    memory: &[u8],
    format: NegotiatedFormat,
    layout: BufferLayout,
) -> Result<OwnedVideoFrame, CaptureError> {
    let chunk_end = layout
        .offset
        .checked_add(layout.size)
        .ok_or_else(|| buffer_error("buffer chunk range overflows"))?;
    let payload = memory
        .get(layout.offset..chunk_end)
        .ok_or_else(|| buffer_error("buffer chunk exceeds mapped memory"))?;
    let row_bytes = usize::try_from(format.width)
        .ok()
        .and_then(|width| width.checked_mul(4))
        .ok_or_else(|| buffer_error("video row size overflows"))?;
    let stride = usize::try_from(layout.stride.unsigned_abs())
        .map_err(|_| buffer_error("video stride is not representable"))?;
    if stride < row_bytes {
        return Err(buffer_error(format!(
            "video stride {stride} is smaller than row width {row_bytes}"
        )));
    }
    let last_row = usize::try_from(format.height.saturating_sub(1))
        .ok()
        .and_then(|height| height.checked_mul(stride))
        .and_then(|offset| offset.checked_add(row_bytes))
        .ok_or_else(|| buffer_error("video plane size overflows"))?;
    if payload.len() < last_row {
        return Err(buffer_error(format!(
            "video payload has {} bytes but {last_row} are required",
            payload.len()
        )));
    }
    let crop = validate_crop(layout.crop, format)?;
    let (output_width, output_height) = transformed_size(crop, layout.transform);
    let output_stride = usize::try_from(output_width)
        .ok()
        .and_then(|width| width.checked_mul(4))
        .ok_or_else(|| buffer_error("output row size overflows"))?;
    let output_len = output_stride
        .checked_mul(
            usize::try_from(output_height)
                .map_err(|_| buffer_error("output height is not representable"))?,
        )
        .ok_or_else(|| buffer_error("output frame size overflows"))?;
    let mut pixels = vec![0; output_len];
    if layout.stride > 0
        && layout.transform == VideoTransform::None
        && matches!(
            format.pixel_format,
            NativePixelFormat::Bgrx | NativePixelFormat::Bgra
        )
    {
        let crop_x = usize::try_from(crop.x)
            .ok()
            .and_then(|value| value.checked_mul(4))
            .ok_or_else(|| buffer_error("crop row offset overflows"))?;
        for y in 0..crop.height {
            let source_y = crop.y + y;
            let source = usize::try_from(source_y)
                .ok()
                .and_then(|row| row.checked_mul(stride))
                .and_then(|row| row.checked_add(crop_x))
                .ok_or_else(|| buffer_error("source row offset overflows"))?;
            let destination = usize::try_from(y)
                .ok()
                .and_then(|row| row.checked_mul(output_stride))
                .ok_or_else(|| buffer_error("output row offset overflows"))?;
            let source_row = payload
                .get(source..source + output_stride)
                .ok_or_else(|| buffer_error("source row exceeds payload"))?;
            let destination_row = &mut pixels[destination..destination + output_stride];
            destination_row.copy_from_slice(source_row);
            if format.pixel_format == NativePixelFormat::Bgrx {
                for pixel in destination_row.as_chunks_mut::<4>().0 {
                    pixel[3] = 255;
                }
            }
        }
        return Ok(OwnedVideoFrame {
            width: output_width,
            height: output_height,
            stride: output_stride,
            pixel_format: PixelFormat::Bgra8,
            pixels: Arc::from(pixels),
        });
    }
    for y in 0..crop.height {
        let source_y = crop.y + y;
        let physical_y = if layout.stride < 0 {
            format.height - 1 - source_y
        } else {
            source_y
        };
        let row_start = usize::try_from(physical_y)
            .ok()
            .and_then(|row| row.checked_mul(stride))
            .ok_or_else(|| buffer_error("source row offset overflows"))?;
        for x in 0..crop.width {
            let source_x = crop.x + x;
            let source = row_start
                .checked_add(
                    usize::try_from(source_x)
                        .ok()
                        .and_then(|value| value.checked_mul(4))
                        .ok_or_else(|| buffer_error("source pixel offset overflows"))?,
                )
                .ok_or_else(|| buffer_error("source pixel offset overflows"))?;
            let rgba = payload
                .get(source..source + 4)
                .ok_or_else(|| buffer_error("source pixel exceeds payload"))?;
            let (output_x, output_y) = transform_point(x, y, crop, layout.transform);
            let destination = usize::try_from(output_y)
                .ok()
                .and_then(|row| row.checked_mul(output_stride))
                .and_then(|row| {
                    usize::try_from(output_x)
                        .ok()
                        .and_then(|column| column.checked_mul(4))
                        .and_then(|column| row.checked_add(column))
                })
                .ok_or_else(|| buffer_error("output pixel offset overflows"))?;
            write_bgra(
                &mut pixels[destination..destination + 4],
                rgba,
                format.pixel_format,
            );
        }
    }
    Ok(OwnedVideoFrame {
        width: output_width,
        height: output_height,
        stride: output_stride,
        pixel_format: PixelFormat::Bgra8,
        pixels: Arc::from(pixels),
    })
}

/// Finds the non-transparent/non-zero content written by the compositor.
/// Mutter zero-pads window streams to the fixed monitor-sized PipeWire buffer,
/// which lets us detect fractional-scaling crop metadata expressed in a
/// smaller coordinate space without changing monitor capture behavior.
pub(crate) fn expand_crop_to_content(
    memory: &[u8],
    format: NegotiatedFormat,
    layout: BufferLayout,
) -> Result<Option<CropRect>, CaptureError> {
    let Some(reported) = layout.crop else {
        return Ok(None);
    };
    let chunk_end = layout
        .offset
        .checked_add(layout.size)
        .ok_or_else(|| buffer_error("buffer chunk range overflows"))?;
    let payload = memory
        .get(layout.offset..chunk_end)
        .ok_or_else(|| buffer_error("buffer chunk exceeds mapped memory"))?;
    let row_bytes = usize::try_from(format.width)
        .ok()
        .and_then(|width| width.checked_mul(4))
        .ok_or_else(|| buffer_error("video row size overflows"))?;
    let stride = usize::try_from(layout.stride.unsigned_abs())
        .map_err(|_| buffer_error("video stride is not representable"))?;
    if stride < row_bytes {
        return Err(buffer_error("video stride is smaller than the row width"));
    }
    let mut min_x = format.width;
    let mut min_y = format.height;
    let mut max_x = 0_u32;
    let mut max_y = 0_u32;
    let mut found = false;
    for logical_y in 0..format.height {
        let physical_y = if layout.stride < 0 {
            format.height - 1 - logical_y
        } else {
            logical_y
        };
        let row_start = usize::try_from(physical_y)
            .ok()
            .and_then(|row| row.checked_mul(stride))
            .ok_or_else(|| buffer_error("source row offset overflows"))?;
        let row_end = row_start
            .checked_add(row_bytes)
            .ok_or_else(|| buffer_error("source row range overflows"))?;
        let row = payload
            .get(row_start..row_end)
            .ok_or_else(|| buffer_error("source row exceeds payload"))?;
        for (x, pixel) in row.as_chunks::<4>().0.iter().enumerate() {
            if *pixel == [0, 0, 0, 0] {
                continue;
            }
            let x = u32::try_from(x).map_err(|_| buffer_error("pixel x exceeds limits"))?;
            found = true;
            min_x = min_x.min(x);
            min_y = min_y.min(logical_y);
            max_x = max_x.max(x);
            max_y = max_y.max(logical_y);
        }
    }
    if !found {
        return Ok(Some(reported));
    }
    let content = CropRect {
        x: min_x,
        y: min_y,
        width: max_x - min_x + 1,
        height: max_y - min_y + 1,
    };
    Ok(Some(union_crop(reported, content, format)))
}

fn union_crop(left: CropRect, right: CropRect, format: NegotiatedFormat) -> CropRect {
    let x = left.x.min(right.x);
    let y = left.y.min(right.y);
    let right_edge = left
        .x
        .saturating_add(left.width)
        .max(right.x.saturating_add(right.width))
        .min(format.width);
    let bottom_edge = left
        .y
        .saturating_add(left.height)
        .max(right.y.saturating_add(right.height))
        .min(format.height);
    CropRect {
        x,
        y,
        width: right_edge.saturating_sub(x),
        height: bottom_edge.saturating_sub(y),
    }
}

#[must_use]
pub(crate) fn video_format(frame: &OwnedVideoFrame) -> VideoFormat {
    VideoFormat {
        width: frame.width,
        height: frame.height,
        stride: frame.stride,
        pixel_format: frame.pixel_format,
    }
}

fn validate_crop(
    crop: Option<CropRect>,
    format: NegotiatedFormat,
) -> Result<CropRect, CaptureError> {
    let crop = crop.unwrap_or(CropRect {
        x: 0,
        y: 0,
        width: format.width,
        height: format.height,
    });
    let right = crop
        .x
        .checked_add(crop.width)
        .ok_or_else(|| buffer_error("crop width overflows"))?;
    let bottom = crop
        .y
        .checked_add(crop.height)
        .ok_or_else(|| buffer_error("crop height overflows"))?;
    if crop.width == 0 || crop.height == 0 || right > format.width || bottom > format.height {
        return Err(buffer_error(
            "crop is empty or outside the negotiated frame",
        ));
    }
    Ok(crop)
}

pub(crate) fn output_dimensions(
    format: NegotiatedFormat,
    crop: Option<CropRect>,
    transform: VideoTransform,
) -> Result<(u32, u32), CaptureError> {
    Ok(transformed_size(validate_crop(crop, format)?, transform))
}

fn transformed_size(crop: CropRect, transform: VideoTransform) -> (u32, u32) {
    match transform {
        VideoTransform::Rotated90
        | VideoTransform::Rotated270
        | VideoTransform::Flipped90
        | VideoTransform::Flipped270 => (crop.height, crop.width),
        _ => (crop.width, crop.height),
    }
}

fn transform_point(x: u32, y: u32, crop: CropRect, transform: VideoTransform) -> (u32, u32) {
    match transform {
        VideoTransform::None => (x, y),
        VideoTransform::Rotated90 => (y, crop.width - 1 - x),
        VideoTransform::Rotated180 => (crop.width - 1 - x, crop.height - 1 - y),
        VideoTransform::Rotated270 => (crop.height - 1 - y, x),
        VideoTransform::Flipped => (crop.width - 1 - x, y),
        VideoTransform::Flipped90 => (y, x),
        VideoTransform::Flipped180 => (x, crop.height - 1 - y),
        VideoTransform::Flipped270 => (crop.height - 1 - y, crop.width - 1 - x),
    }
}

fn write_bgra(destination: &mut [u8], source: &[u8], format: NativePixelFormat) {
    let (blue, green, red, alpha) = match format {
        NativePixelFormat::Bgrx => (source[0], source[1], source[2], 255),
        NativePixelFormat::Bgra => (source[0], source[1], source[2], source[3]),
        NativePixelFormat::Rgbx => (source[2], source[1], source[0], 255),
        NativePixelFormat::Rgba => (source[2], source[1], source[0], source[3]),
    };
    destination.copy_from_slice(&[blue, green, red, alpha]);
}

fn buffer_error(message: impl Into<String>) -> CaptureError {
    CaptureError::native(NativeCaptureErrorCode::PipewireBufferInvalid, message)
}
