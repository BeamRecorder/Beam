use std::{mem::size_of, ops::Range};

#[path = "../../../../test/screen/linux/pipewire/metadata.rs"]
mod metadata_checks;

use pipewire::spa::buffer::meta::{
    MetaCursor, MetaHeader, MetaHeaderFlags, MetaVideoCrop, MetaVideoTransform,
    MetaVideoTransformValue,
};

use crate::cursor::Hotspot;

use super::params::CURSOR_META_SIZE;
use super::{CropRect, CursorClassifier, CursorMetadata, HeaderMetadata, VideoTransform};

pub(super) fn header(buffer: &pipewire::buffer::Buffer<'_>) -> HeaderMetadata {
    decode_header(buffer.find_meta::<MetaHeader>())
}

fn decode_header(header: Option<&MetaHeader>) -> HeaderMetadata {
    let Some(header) = header else {
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

pub(super) fn cursor(
    buffer: &pipewire::buffer::Buffer<'_>,
    classifier: &mut CursorClassifier,
    allocations: &std::collections::HashMap<usize, usize>,
) -> Option<CursorMetadata> {
    let cursor = buffer.find_meta::<MetaCursor>()?;
    let size = allocations
        .get(&(cursor as *const MetaCursor as usize))
        .copied()
        .unwrap_or(0);
    decode_cursor(Some(cursor), classifier, size)
}

fn decode_cursor(
    cursor: Option<&MetaCursor>,
    classifier: &mut CursorClassifier,
    allocation_size: usize,
) -> Option<CursorMetadata> {
    let cursor = cursor?;
    let position = cursor.position();
    let shape = cursor_shape(cursor, classifier, allocation_size);
    Some(CursorMetadata {
        id: u64::from(cursor.id()),
        shape_id: shape.map(|(id, _, _)| id),
        x: position.x,
        y: position.y,
        hotspot: shape.map(|(_, hotspot, _)| hotspot),
        cursor_kind: shape.map(|(_, _, kind)| kind),
    })
}

fn cursor_shape(
    cursor: &MetaCursor,
    classifier: &mut CursorClassifier,
    allocation_size: usize,
) -> Option<(u64, Hotspot, crate::cursor::CursorKind)> {
    if !cursor.is_valid() {
        return None;
    }
    let cursor_offset = usize::try_from(cursor.bitmap_offset()).ok()?;
    let bitmap_meta_size = size_of::<pipewire::spa::sys::spa_meta_bitmap>();
    if cursor_offset % align_of::<pipewire::spa::sys::spa_meta_bitmap>() != 0
        || cursor_offset < size_of::<pipewire::spa::sys::spa_meta_cursor>()
        || cursor_offset.checked_add(bitmap_meta_size)? > allocation_size.min(CURSOR_META_SIZE)
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
    let data_offset = usize::try_from(bitmap.offset()).ok()?;
    let range = validated_cursor_bitmap_range(
        cursor_offset,
        bitmap_meta_size,
        data_offset,
        width,
        height,
        stride,
    )?;
    if range.end > allocation_size {
        return None;
    }
    let pixels = bitmap.bitmap_data()?;
    let id = stable_cursor_shape_id(
        bitmap.format().0,
        size.width,
        size.height,
        bitmap.stride(),
        pixels,
    );
    let point = cursor.hotspot();
    let hotspot = Hotspot {
        x: u32::try_from(point.x).unwrap_or(0),
        y: u32::try_from(point.y).unwrap_or(0),
    };
    let kind = classifier.classify(
        id,
        bitmap.format(),
        size.width,
        size.height,
        bitmap.stride(),
        pixels,
        hotspot,
    );
    Some((id, hotspot, kind))
}

fn validated_cursor_bitmap_range(
    cursor_offset: usize,
    bitmap_meta_size: usize,
    data_offset: usize,
    width: usize,
    height: usize,
    stride: usize,
) -> Option<Range<usize>> {
    if cursor_offset < size_of::<pipewire::spa::sys::spa_meta_cursor>()
        || cursor_offset.checked_add(bitmap_meta_size)? > CURSOR_META_SIZE
        || width == 0
        || height == 0
        || width > 384
        || height > 384
        || stride < width.checked_mul(4)?
        || data_offset < bitmap_meta_size
    {
        return None;
    }
    let start = cursor_offset.checked_add(data_offset)?;
    let end = start.checked_add(height.checked_mul(stride)?)?;
    (end <= CURSOR_META_SIZE).then_some(start..end)
}

pub(crate) fn stable_cursor_shape_id(
    format: u32,
    width: u32,
    height: u32,
    stride: i32,
    pixels: &[u8],
) -> u64 {
    const FNV_OFFSET_BASIS: u64 = 0xcbf2_9ce4_8422_2325;
    const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;
    let mut hash = FNV_OFFSET_BASIS;
    for byte in format
        .to_le_bytes()
        .into_iter()
        .chain(width.to_le_bytes())
        .chain(height.to_le_bytes())
        .chain(stride.to_le_bytes())
        .chain(pixels.iter().copied())
    {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    if hash == 0 { 1 } else { hash }
}

pub(super) fn crop(buffer: &pipewire::buffer::Buffer<'_>) -> Option<CropRect> {
    decode_crop(buffer.find_meta::<MetaVideoCrop>())
}

fn decode_crop(crop: Option<&MetaVideoCrop>) -> Option<CropRect> {
    let crop = crop?.meta_region();
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
    decode_transform(buffer.find_meta::<MetaVideoTransform>())
}

fn decode_transform(transform: Option<&MetaVideoTransform>) -> VideoTransform {
    let Some(transform) = transform else {
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

#[path = "../../../../test/screen/linux/pipewire/metadata_decode.rs"]
mod decode_checks;

// PipeWire owns these buffers and calls listeners before exposing/removing them.
// Save the actual allocation length: requesting a maximum does not guarantee it.
pub(super) unsafe fn cursor_allocation(
    buffer: *mut pipewire::sys::pw_buffer,
) -> Option<(usize, usize)> {
    // SAFETY: caller supplies the live buffer from a PipeWire add/remove callback.
    let buffer = unsafe { buffer.as_ref()?.buffer.as_ref()? };
    if buffer.metas.is_null() {
        return None;
    }
    // SAFETY: n_metas entries are owned by this live SPA buffer.
    let metas = unsafe { std::slice::from_raw_parts(buffer.metas, buffer.n_metas as usize) };
    let meta = metas
        .iter()
        .find(|meta| meta.type_ == pipewire::spa::sys::SPA_META_Cursor)?;
    (!meta.data.is_null()).then_some((meta.data as usize, meta.size as usize))
}
