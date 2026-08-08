use pipewire::spa::buffer::meta::{
    MetaCursor, MetaHeader, MetaHeaderFlags, MetaVideoCrop, MetaVideoTransform,
    MetaVideoTransformValue,
};

use crate::cursor::Hotspot;

use super::{CropRect, CursorMetadata, HeaderMetadata, VideoTransform};

pub(super) fn header(buffer: &pipewire::buffer::Buffer<'_>) -> HeaderMetadata {
    let Some(header) = buffer.find_meta::<MetaHeader>() else {
        return HeaderMetadata::default();
    };
    let flags = header.flags();
    HeaderMetadata {
        pts_ns: u64::try_from(header.pts()).ok(),
        sequence: header.seq(),
        discont: flags.contains(MetaHeaderFlags::DISCONT),
        corrupted: flags.contains(MetaHeaderFlags::CORRUPTED),
        gap: flags.contains(MetaHeaderFlags::GAP),
    }
}

pub(super) fn cursor(buffer: &pipewire::buffer::Buffer<'_>) -> Option<CursorMetadata> {
    let cursor = buffer.find_meta::<MetaCursor>()?;
    if !cursor.is_valid() {
        return Some(CursorMetadata {
            valid: false,
            id: 0,
            x: 0,
            y: 0,
            hotspot: None,
        });
    }
    let position = cursor.position();
    // libspa's safe wrapper cannot prove the upper bound of bitmap_offset.
    // Keep the hotspot absent rather than dereferencing an unbounded bitmap.
    let hotspot = None::<Hotspot>;
    Some(CursorMetadata {
        valid: true,
        id: cursor.id(),
        x: position.x,
        y: position.y,
        hotspot,
    })
}

pub(super) fn crop(buffer: &pipewire::buffer::Buffer<'_>) -> Option<CropRect> {
    let crop = buffer.find_meta::<MetaVideoCrop>()?.meta_region();
    if !crop.is_valid() {
        return None;
    }
    let position = crop.position();
    let size = crop.size();
    Some(CropRect {
        x: u32::try_from(position.x).ok()?,
        y: u32::try_from(position.y).ok()?,
        width: size.width,
        height: size.height,
    })
}

pub(super) fn transform(buffer: &pipewire::buffer::Buffer<'_>) -> VideoTransform {
    let Some(transform) = buffer.find_meta::<MetaVideoTransform>() else {
        return VideoTransform::None;
    };
    match transform.transform() {
        MetaVideoTransformValue::ROTATED90 => VideoTransform::Rotated90,
        MetaVideoTransformValue::ROTATED180 => VideoTransform::Rotated180,
        MetaVideoTransformValue::ROTATED270 => VideoTransform::Rotated270,
        MetaVideoTransformValue::FLIPPED => VideoTransform::Flipped,
        MetaVideoTransformValue::FLIPPED90 => VideoTransform::Flipped90,
        MetaVideoTransformValue::FLIPPED180 => VideoTransform::Flipped180,
        MetaVideoTransformValue::FLIPPED270 => VideoTransform::Flipped270,
        _ => VideoTransform::None,
    }
}
