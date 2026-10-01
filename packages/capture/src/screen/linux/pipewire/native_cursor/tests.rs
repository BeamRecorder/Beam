#![allow(clippy::expect_used)]
use super::super::{CropRect, NativePixelFormat, canonical_bitmap};
use super::*;
use crate::screen::{PixelCrop, PixelFormat};
use pipewire::spa::param::video::VideoFormat;
fn frame(width: u32, height: u32) -> OwnedVideoFrame {
    OwnedVideoFrame {
        width,
        height,
        stride: width as usize * 4,
        pixel_format: PixelFormat::Bgra8,
        pixels: vec![20; (width * height * 4) as usize].into(),
    }
}
fn position(x: i32, y: i32) -> CursorMetadata {
    CursorMetadata {
        id: 1,
        shape_id: Some(1),
        x,
        y,
        hotspot: None,
        cursor_kind: None,
    }
}
fn bitmap() -> NativeCursorBitmap {
    NativeCursorBitmap {
        width: 2,
        height: 1,
        hotspot: Hotspot { x: 1, y: 0 },
        pixels: vec![128, 0, 0, 128, 0, 255, 0, 255].into(),
    }
}
fn geometry(
    frame: &OwnedVideoFrame,
    transform: VideoTransform,
) -> (FrameGeometry, NegotiatedFormat) {
    let format = NegotiatedFormat::new(4, 4, NativePixelFormat::Bgra).expect("format");
    (
        FrameGeometry::from_frame(format, None, None, transform, None, frame),
        format,
    )
}
#[test]
fn native_pixels_use_hotspot_premultiplied_alpha_and_bgra() {
    let clean = frame(4, 4);
    let (geometry, format) = geometry(&clean, VideoTransform::None);
    let mut overlay = NativeCursorOverlay::new(true, 60);
    overlay.update(Some(position(2, 1)), Some(bitmap()));
    let painted = overlay.frame(clean, geometry, format);
    assert_eq!(&painted.pixels[20..24], &[10, 10, 138, 138]);
    assert_eq!(&painted.pixels[24..28], &[0, 255, 0, 255]);
}
#[test]
fn cursor_only_movement_and_hiding_repaint_clean_frame_without_trails() {
    let clean = frame(4, 4);
    let (geometry, format) = geometry(&clean, VideoTransform::None);
    let mut overlay = NativeCursorOverlay::new(true, 60);
    overlay.update(Some(position(2, 1)), Some(bitmap()));
    overlay.frame(clean.clone(), geometry, format);
    overlay.update(
        Some(CursorMetadata {
            shape_id: None,
            ..position(2, 2)
        }),
        None,
    );
    let moved = overlay
        .cursor_frame(geometry, format)
        .expect("cached frame");
    assert_eq!(&moved.pixels[20..28], &[20; 8]);
    assert_eq!(&moved.pixels[40..44], &[0, 255, 0, 255]);
    overlay.update(
        Some(CursorMetadata {
            shape_id: Some(0),
            ..position(2, 2)
        }),
        None,
    );
    assert_eq!(
        overlay
            .cursor_frame(geometry, format)
            .expect("hidden frame")
            .pixels,
        clean.pixels
    );
}
#[test]
fn disabled_mode_and_missing_bitmap_leave_pixels_untouched() {
    let clean = frame(4, 4);
    let (geometry, format) = geometry(&clean, VideoTransform::None);
    for enabled in [true, false] {
        let mut overlay = NativeCursorOverlay::new(enabled, 60);
        overlay.update(
            Some(position(2, 1)),
            if enabled { None } else { Some(bitmap()) },
        );
        assert_eq!(
            overlay.frame(clean.clone(), geometry, format).pixels,
            clean.pixels
        );
        assert_eq!(overlay.cursor_frame(geometry, format).is_some(), enabled);
    }
}
#[test]
fn invalid_cursor_id_does_not_replace_position_and_pause_discards_old_image() {
    let clean = frame(4, 4);
    let (geometry, format) = geometry(&clean, VideoTransform::None);
    let mut overlay = NativeCursorOverlay::new(true, 60);
    overlay.update(Some(position(2, 1)), Some(bitmap()));
    let painted = overlay.frame(clean, geometry, format);
    overlay.update(
        Some(CursorMetadata {
            id: 0,
            ..position(0, 0)
        }),
        None,
    );
    assert_eq!(
        overlay
            .cursor_frame(geometry, format)
            .expect("retained position")
            .pixels,
        painted.pixels
    );
    overlay.clear_frame();
    assert!(overlay.cursor_frame(geometry, format).is_none());
}
#[test]
fn native_cursor_matches_all_frame_rotations_and_reflections() {
    for transform in [
        VideoTransform::None,
        VideoTransform::Rotated90,
        VideoTransform::Rotated180,
        VideoTransform::Rotated270,
        VideoTransform::Flipped,
        VideoTransform::Flipped90,
        VideoTransform::Flipped180,
        VideoTransform::Flipped270,
    ] {
        let clean = frame(4, 4);
        let (geometry, format) = geometry(&clean, transform);
        let mut overlay = NativeCursorOverlay::new(true, 60);
        overlay.update(Some(position(2, 1)), Some(bitmap()));
        let painted = overlay.frame(clean, geometry, format);
        let point = geometry
            .map_cursor(Some(position(2, 1)), format)
            .expect("mapped hotspot");
        let offset = point.y as usize * painted.stride + point.x as usize * 4;
        assert_eq!(
            &painted.pixels[offset..offset + 4],
            &[0, 255, 0, 255],
            "{transform:?}"
        );
        assert_eq!(
            painted
                .pixels
                .as_chunks::<4>()
                .0
                .iter()
                .filter(|pixel| *pixel != &[20; 4])
                .count(),
            2
        );
    }
}
#[test]
fn partial_cursor_and_region_crop_remain_clipped_to_output() {
    let mut overlay = NativeCursorOverlay::new(true, 60);
    let clean = frame(2, 2);
    let format = NegotiatedFormat::new(4, 4, NativePixelFormat::Bgra).expect("format");
    let geometry = FrameGeometry::from_frame(
        format,
        None,
        None,
        VideoTransform::None,
        Some(PixelCrop {
            start_x: 1,
            start_y: 1,
            end_x: 3,
            end_y: 3,
        }),
        &clean,
    );
    overlay.update(Some(position(1, 1)), Some(bitmap()));
    let painted = overlay.frame(clean, geometry, format);
    assert_eq!(&painted.pixels[..4], &[0, 255, 0, 255]);
    assert_eq!(painted.pixels.len(), 16);
    overlay.update(Some(position(-100, -100)), None);
    assert_eq!(
        overlay
            .cursor_frame(geometry, format)
            .expect("offscreen")
            .pixels
            .as_ref(),
        &[20; 16]
    );
}
#[test]
fn repaired_window_geometry_scales_real_cursor_pixels() {
    let clean = frame(4, 4);
    let format = NegotiatedFormat::new(4, 4, NativePixelFormat::Bgra).expect("format");
    let geometry = FrameGeometry::from_frame(
        format,
        None,
        Some(CropRect {
            x: 0,
            y: 0,
            width: 2,
            height: 2,
        }),
        VideoTransform::None,
        None,
        &clean,
    );
    let mut overlay = NativeCursorOverlay::new(true, 60);
    overlay.update(Some(position(1, 0)), Some(bitmap()));
    let painted = overlay.frame(clean, geometry, format);
    assert_eq!(&painted.pixels[8..16], &[0, 255, 0, 255, 0, 255, 0, 255]);
    assert_eq!(&painted.pixels[24..32], &[0, 255, 0, 255, 0, 255, 0, 255]);
}
#[test]
fn bitmap_channels_padding_negative_stride_and_invalid_layouts() {
    for (format, bytes) in [
        (VideoFormat::RGBA, [1, 2, 3, 4]),
        (VideoFormat::BGRA, [3, 2, 1, 4]),
        (VideoFormat::ARGB, [4, 1, 2, 3]),
        (VideoFormat::ABGR, [4, 3, 2, 1]),
    ] {
        assert_eq!(
            canonical_bitmap(format, 1, 1, 4, &bytes),
            Some(vec![1, 2, 3, 4])
        );
    }
    assert_eq!(
        canonical_bitmap(
            VideoFormat::RGBA,
            1,
            2,
            -8,
            &[1, 2, 3, 4, 0, 0, 0, 0, 5, 6, 7, 8, 0, 0, 0, 0]
        ),
        Some(vec![5, 6, 7, 8, 1, 2, 3, 4])
    );
    assert!(canonical_bitmap(VideoFormat::RGBx, 1, 1, 4, &[0; 4]).is_none());
    assert!(canonical_bitmap(VideoFormat::RGBA, 1, 1, 2, &[0; 4]).is_none());
    assert!(canonical_bitmap(VideoFormat::RGBA, 1, 1, 4, &[]).is_none());
    assert!(canonical_bitmap(VideoFormat::RGBA, 0, 1, 4, &[0; 4]).is_none());
}

#[test]
fn native_cursor_only_updates_never_add_extra_frames_to_one_recording_tick() {
    let mut overlay = NativeCursorOverlay::new(true, 60);
    assert!(overlay.frame_due_at(0));
    overlay.record_frame_at(0);
    for timestamp in [1, 1_000_000, 16_666_666] {
        assert!(!overlay.frame_due_at(timestamp));
    }
    assert!(overlay.frame_due_at(16_666_667));
    overlay.record_frame_at(16_666_667);
    assert!(!overlay.frame_due_at(20_000_000));
    assert!(overlay.frame_due_at(33_333_334));
    overlay.clear_frame();
    assert!(overlay.frame_due_at(20_000_000));
}
#[test]
fn cadence_does_not_change_telemetry_only_capture_or_overflow_at_long_durations() {
    let mut overlay = NativeCursorOverlay::new(false, 60);
    overlay.record_frame_at(0);
    assert!(overlay.frame_due_at(0));
    let mut native = NativeCursorOverlay::new(true, 240);
    native.record_frame_at(u64::MAX - 1);
    assert!(!native.frame_due_at(u64::MAX));
}
#[test]
fn unreadable_new_bitmap_does_not_reuse_previous_cursor_artwork() {
    let clean = frame(4, 4);
    let (geometry, format) = geometry(&clean, VideoTransform::None);
    let mut overlay = NativeCursorOverlay::new(true, 60);
    overlay.update(Some(position(2, 1)), Some(bitmap()));
    overlay.frame(clean.clone(), geometry, format);
    overlay.update(
        Some(CursorMetadata {
            shape_id: Some(2),
            ..position(2, 1)
        }),
        None,
    );
    assert_eq!(
        overlay
            .cursor_frame(geometry, format)
            .expect("clean image")
            .pixels,
        clean.pixels
    );
}
