use std::sync::Arc;

use crate::{
    CaptureError,
    model::ScreenRegion,
    screen::{OwnedVideoFrame, PixelCrop, PixelFormat, normalize_crop},
};

use super::{
    CropRect, CursorMetadata, NegotiatedFormat, VideoTransform, map_cursor_metadata,
    output_dimensions,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct FrameGeometry {
    pub(super) frame_crop: Option<CropRect>,
    pub(super) cursor_crop: Option<CropRect>,
    pub(super) transform: VideoTransform,
    region_crop: Option<PixelCrop>,
    uncropped_width: u32,
    uncropped_height: u32,
    width: u32,
    height: u32,
}

impl FrameGeometry {
    pub(super) fn from_frame(
        format: NegotiatedFormat,
        frame_crop: Option<CropRect>,
        cursor_crop: Option<CropRect>,
        transform: VideoTransform,
        region_crop: Option<PixelCrop>,
        frame: &OwnedVideoFrame,
    ) -> Self {
        let (uncropped_width, uncropped_height) =
            output_dimensions(format, frame_crop, transform).unwrap_or((frame.width, frame.height));
        debug_assert_eq!(
            region_crop.map_or((uncropped_width, uncropped_height), |crop| {
                (crop.width(), crop.height())
            }),
            (frame.width, frame.height)
        );
        Self {
            frame_crop,
            cursor_crop,
            transform,
            region_crop,
            uncropped_width,
            uncropped_height,
            width: frame.width,
            height: frame.height,
        }
    }

    pub(super) fn map_cursor(
        self,
        cursor: Option<CursorMetadata>,
        format: NegotiatedFormat,
    ) -> Option<CursorMetadata> {
        let mut cursor = map_cursor_metadata(
            cursor,
            format.width,
            format.height,
            self.cursor_crop,
            self.transform,
        )?;
        let (cursor_width, cursor_height) =
            output_dimensions(format, self.cursor_crop, self.transform).ok()?;
        cursor.x = scale_coordinate(cursor.x, cursor_width, self.uncropped_width);
        cursor.y = scale_coordinate(cursor.y, cursor_height, self.uncropped_height);
        if let Some(crop) = self.region_crop {
            cursor.x = subtract_offset(cursor.x, crop.start_x);
            cursor.y = subtract_offset(cursor.y, crop.start_y);
        }
        Some(cursor)
    }

    pub(super) const fn width(self) -> u32 {
        self.width
    }

    pub(super) const fn height(self) -> u32 {
        self.height
    }
}

pub(super) fn crop_frame(
    frame: OwnedVideoFrame,
    region: Option<ScreenRegion>,
) -> Result<(OwnedVideoFrame, Option<PixelCrop>), CaptureError> {
    let Some(region) = region else {
        return Ok((frame, None));
    };
    if frame.pixel_format != PixelFormat::Bgra8 {
        return Err(CaptureError::InvalidConfiguration(
            "Linux screen crop requires BGRA frames".into(),
        ));
    }
    let crop = normalize_crop(region, frame.width, frame.height)?;
    let output_stride = usize::try_from(crop.width())
        .ok()
        .and_then(|width| width.checked_mul(4))
        .ok_or_else(|| {
            CaptureError::InvalidConfiguration("screen crop row size overflows".into())
        })?;
    let output_len = output_stride
        .checked_mul(usize::try_from(crop.height()).map_err(|_| {
            CaptureError::InvalidConfiguration("screen crop height is not representable".into())
        })?)
        .ok_or_else(|| CaptureError::InvalidConfiguration("screen crop size overflows".into()))?;
    let mut pixels = vec![0; output_len];
    let source_x = usize::try_from(crop.start_x)
        .ok()
        .and_then(|x| x.checked_mul(4))
        .ok_or_else(|| CaptureError::InvalidConfiguration("screen crop offset overflows".into()))?;
    for row in 0..crop.height() {
        let source = usize::try_from(crop.start_y + row)
            .ok()
            .and_then(|y| y.checked_mul(frame.stride))
            .and_then(|offset| offset.checked_add(source_x))
            .ok_or_else(|| {
                CaptureError::InvalidConfiguration("screen crop offset overflows".into())
            })?;
        let destination = usize::try_from(row)
            .ok()
            .and_then(|row| row.checked_mul(output_stride))
            .ok_or_else(|| {
                CaptureError::InvalidConfiguration("screen crop offset overflows".into())
            })?;
        let source_end = source.checked_add(output_stride).ok_or_else(|| {
            CaptureError::InvalidConfiguration("screen crop row range overflows".into())
        })?;
        let destination_end = destination.checked_add(output_stride).ok_or_else(|| {
            CaptureError::InvalidConfiguration("screen crop row range overflows".into())
        })?;
        let source_row = frame.pixels.get(source..source_end).ok_or_else(|| {
            CaptureError::InvalidConfiguration("screen crop exceeds the frame".into())
        })?;
        pixels[destination..destination_end].copy_from_slice(source_row);
    }
    Ok((
        OwnedVideoFrame {
            width: crop.width(),
            height: crop.height(),
            stride: output_stride,
            pixel_format: frame.pixel_format,
            pixels: Arc::from(pixels),
        },
        Some(crop),
    ))
}

fn scale_coordinate(value: i32, source: u32, destination: u32) -> i32 {
    if source == destination || source == 0 {
        return value;
    }
    let scaled = i64::from(value)
        .saturating_mul(i64::from(destination))
        .checked_div(i64::from(source))
        .unwrap_or_default();
    i32::try_from(scaled).unwrap_or(if scaled < 0 { i32::MIN } else { i32::MAX })
}

fn subtract_offset(value: i32, offset: u32) -> i32 {
    let adjusted = i64::from(value).saturating_sub(i64::from(offset));
    i32::try_from(adjusted).unwrap_or(if adjusted < 0 { i32::MIN } else { i32::MAX })
}

pub(super) fn repaired_window_crop(
    reported: Option<CropRect>,
    content: Option<CropRect>,
) -> Option<CropRect> {
    let (Some(reported), Some(content)) = (reported, content) else {
        return reported;
    };
    let width_scale = f64::from(content.width) / f64::from(reported.width.max(1));
    let height_scale = f64::from(content.height) / f64::from(reported.height.max(1));
    let uniform_scale = (width_scale - height_scale).abs() <= 0.05;
    let materially_larger = width_scale >= 1.1 && height_scale >= 1.1;
    if uniform_scale && materially_larger {
        Some(content)
    } else {
        Some(reported)
    }
}
