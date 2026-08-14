use std::mem::size_of;

use pipewire::spa::buffer::meta::{
    MetaCursor, MetaHeader, MetaHeaderFlags, MetaVideoCrop, MetaVideoTransform,
    MetaVideoTransformValue,
};

use crate::cursor::Hotspot;

use super::params::CURSOR_META_SIZE;
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
    let position = cursor.position();
    Some(CursorMetadata {
        id: u64::from(cursor.id()),
        x: position.x,
        y: position.y,
        hotspot: cursor_hotspot(cursor),
    })
}

fn cursor_hotspot(cursor: &MetaCursor) -> Option<Hotspot> {
    if !cursor.is_valid() {
        return None;
    }
    let cursor_offset = usize::try_from(cursor.bitmap_offset()).ok()?;
    let bitmap_meta_size = size_of::<pipewire::spa::sys::spa_meta_bitmap>();
    if cursor_offset < size_of::<pipewire::spa::sys::spa_meta_cursor>()
        || cursor_offset.checked_add(bitmap_meta_size)? > CURSOR_META_SIZE
    {
        return None;
    }
    let bitmap = cursor.bitmap()?;
    if !bitmap.is_valid() {
        return None;
    }
    let size = bitmap.size();
    let width = usize::try_from(size.width).ok()?;
    let height = usize::try_from(size.height).ok()?;
    let stride = usize::try_from(bitmap.stride().unsigned_abs()).ok()?;
    if width == 0 || height == 0 || width > 384 || height > 384 || stride < width {
        return None;
    }
    let data_offset = usize::try_from(bitmap.offset()).ok()?;
    let data_size = height.checked_mul(stride)?;
    let data_end = cursor_offset
        .checked_add(data_offset)?
        .checked_add(data_size)?;
    if data_offset < bitmap_meta_size || data_end > CURSOR_META_SIZE {
        return None;
    }
    bitmap.bitmap_data()?;
    let point = cursor.hotspot();
    Some(Hotspot {
        x: u32::try_from(point.x).unwrap_or(0),
        y: u32::try_from(point.y).unwrap_or(0),
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
