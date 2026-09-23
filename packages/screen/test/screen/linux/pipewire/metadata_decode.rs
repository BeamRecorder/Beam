#![cfg(test)]
#![allow(clippy::expect_used)]
use super::*;
use pipewire::spa::sys;
#[test]
fn headers_preserve_valid_pts_and_classify_unusable_native_time() {
    assert_eq!(decode_header(None).pts_ns, None);
    let mut raw = sys::spa_meta_header {
        flags: MetaHeaderFlags::DISCONT.bits()
            | MetaHeaderFlags::GAP.bits()
            | MetaHeaderFlags::CORRUPTED.bits(),
        offset: 0,
        pts: 9,
        dts_offset: 0,
        seq: 7,
    };
    // SAFETY: MetaHeader is repr(transparent) over this initialized SPA header.
    let decoded = decode_header(Some(unsafe {
        &*(&raw as *const sys::spa_meta_header).cast::<MetaHeader>()
    }));
    assert_eq!(decoded.pts_ns, Some(9));
    assert_eq!(decoded.sequence, 7);
    assert!(decoded.discont && decoded.gap && decoded.corrupted);
    raw.pts = -1;
    // SAFETY: same transparent layout and lifetime as above.
    assert_eq!(
        decode_header(Some(unsafe {
            &*(&raw as *const sys::spa_meta_header).cast::<MetaHeader>()
        }))
        .pts_ns,
        None
    );
}
#[test]
fn all_native_transforms_map_to_the_portable_orientation() {
    assert_eq!(decode_transform(None), VideoTransform::None);
    for (value, expected) in [
        (0, VideoTransform::None),
        (1, VideoTransform::Rotated90),
        (2, VideoTransform::Rotated180),
        (3, VideoTransform::Rotated270),
        (4, VideoTransform::Flipped),
        (5, VideoTransform::Flipped90),
        (6, VideoTransform::Flipped180),
        (7, VideoTransform::Flipped270),
        (99, VideoTransform::None),
    ] {
        let raw = sys::spa_meta_videotransform { transform: value };
        // SAFETY: MetaVideoTransform transparently wraps spa_meta_videotransform.
        let wrapped =
            unsafe { &*(&raw as *const sys::spa_meta_videotransform).cast::<MetaVideoTransform>() };
        assert_eq!(decode_transform(Some(wrapped)), expected);
    }
}
#[test]
fn crop_metadata_rejects_negative_origins_and_empty_regions() {
    assert!(decode_crop(None).is_none());
    for (x, y, width, height, valid) in [
        (2, 3, 16, 8, true),
        (-1, 0, 16, 8, false),
        (0, -1, 16, 8, false),
        (0, 0, 0, 8, false),
        (0, 0, 16, 0, false),
    ] {
        let raw = sys::spa_meta_region {
            region: sys::spa_region {
                position: sys::spa_point { x, y },
                size: sys::spa_rectangle { width, height },
            },
        };
        // SAFETY: MetaVideoCrop transparently wraps MetaRegion then spa_meta_region.
        let wrapped = unsafe { &*(&raw as *const sys::spa_meta_region).cast::<MetaVideoCrop>() };
        assert_eq!(decode_crop(Some(wrapped)).is_some(), valid);
    }
}
#[test]
fn cursor_metadata_checks_offsets_and_keeps_shape_identity() {
    let mut classifier = CursorClassifier::system();
    assert!(decode_cursor(None, &mut classifier, CURSOR_META_SIZE).is_none());
    let cursor_size = size_of::<sys::spa_meta_cursor>();
    let bitmap_size = size_of::<sys::spa_meta_bitmap>();
    let mut storage = vec![0u64; CURSOR_META_SIZE.div_ceil(8)];
    for (id, offset, format, width, expected) in [
        (0, cursor_size, sys::SPA_VIDEO_FORMAT_BGRA, 2, false),
        (1, 0, sys::SPA_VIDEO_FORMAT_BGRA, 2, false),
        (1, CURSOR_META_SIZE, sys::SPA_VIDEO_FORMAT_BGRA, 2, false),
        (1, cursor_size, 0, 2, false),
        (1, cursor_size, sys::SPA_VIDEO_FORMAT_BGRA, 385, false),
        (1, cursor_size, sys::SPA_VIDEO_FORMAT_BGRA, 2, true),
    ] {
        let raw = sys::spa_meta_cursor {
            id,
            flags: 0,
            position: sys::spa_point { x: 5, y: 9 },
            hotspot: sys::spa_point { x: -1, y: 1 },
            bitmap_offset: offset as u32,
        };
        let bitmap = sys::spa_meta_bitmap {
            format,
            size: sys::spa_rectangle { width, height: 2 },
            stride: 8,
            offset: bitmap_size as u32,
        };
        // SAFETY: u64 storage has sufficient alignment and CURSOR_META_SIZE bytes.
        // Both C structs fit, have aligned offsets, and remain valid for decoding.
        // MetaCursor is transparent over spa_meta_cursor. Pixel storage is initialized.
        let cursor = unsafe {
            let ptr = storage.as_mut_ptr().cast::<u8>();
            ptr.cast::<sys::spa_meta_cursor>().write(raw);
            ptr.add(cursor_size)
                .cast::<sys::spa_meta_bitmap>()
                .write(bitmap);
            &*ptr.cast::<MetaCursor>()
        };
        let decoded = decode_cursor(Some(cursor), &mut classifier, CURSOR_META_SIZE)
            .expect("position metadata");
        assert_eq!((decoded.x, decoded.y), (5, 9));
        assert_eq!(decoded.shape_id.is_some(), expected);
        if expected {
            let truncated = decode_cursor(Some(cursor), &mut classifier, cursor_size + bitmap_size)
                .expect("position retained");
            assert!(truncated.shape_id.is_none());
            assert!(
                decode_cursor(Some(cursor), &mut classifier, cursor_size)
                    .expect("position only")
                    .shape_id
                    .is_none()
            );
            assert_eq!(decoded.hotspot, Some(Hotspot { x: 0, y: 1 }));
            assert_eq!(
                decode_cursor(Some(cursor), &mut classifier, CURSOR_META_SIZE)
                    .expect("cached shape")
                    .shape_id,
                decoded.shape_id
            );
        }
    }
}
#[test]
fn cursor_allocation_uses_the_reported_spa_size_not_the_requested_maximum() {
    let mut bytes = [0u64; 32];
    let mut meta = sys::spa_meta {
        type_: sys::SPA_META_Cursor,
        size: 128,
        data: bytes.as_mut_ptr().cast(),
    };
    let mut spa = sys::spa_buffer {
        n_metas: 1,
        n_datas: 0,
        metas: &raw mut meta,
        datas: std::ptr::null_mut(),
    };
    // SAFETY: pw_buffer is a C descriptor and all zero fields are valid empty pointers/counts.
    let mut buffer: pipewire::sys::pw_buffer = unsafe { std::mem::zeroed() };
    buffer.buffer = &raw mut spa;
    // SAFETY: all referenced buffers and descriptors remain live for these calls.
    unsafe {
        assert_eq!(
            cursor_allocation(&raw mut buffer),
            Some((bytes.as_ptr() as usize, 128))
        );
        (*spa.metas).type_ = sys::SPA_META_Header;
        assert!(cursor_allocation(&raw mut buffer).is_none());
        (*spa.metas).type_ = sys::SPA_META_Cursor;
        (*spa.metas).data = std::ptr::null_mut();
        assert!(cursor_allocation(&raw mut buffer).is_none());
        (*buffer.buffer).metas = std::ptr::null_mut();
        assert!(cursor_allocation(&raw mut buffer).is_none());
        buffer.buffer = std::ptr::null_mut();
        assert!(cursor_allocation(&raw mut buffer).is_none());
        assert!(cursor_allocation(std::ptr::null_mut()).is_none());
    }
}
