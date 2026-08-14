#![allow(clippy::expect_used)]

use std::{
    mem::size_of,
    sync::{Arc, Mutex},
};

use crate::{
    CaptureError, NativeCaptureErrorCode,
    screen::{
        CursorSampleState, FrameTimestamp, OwnedScreenSample, OwnedVideoFrame, PixelFormat,
        ScreenDiscontinuity, ScreenSampleSink, TimestampSource, VideoFormat,
    },
};

use super::*;

fn negotiated(format: NativePixelFormat, width: u32, height: u32) -> NegotiatedFormat {
    NegotiatedFormat::new(width, height, format).expect("valid test format")
}

fn layout(stride: i32, size: usize) -> BufferLayout {
    BufferLayout {
        offset: 0,
        size,
        stride,
        crop: None,
        transform: VideoTransform::None,
    }
}

fn copy_pixel(format: NativePixelFormat, bytes: &[u8]) -> Vec<u8> {
    copy_frame(bytes, negotiated(format, 1, 1), layout(4, 4))
        .expect("pixel should copy")
        .pixels
        .to_vec()
}

#[test]
fn converts_all_negotiated_formats_to_owned_bgra() {
    assert_eq!(
        copy_pixel(NativePixelFormat::Bgrx, &[1, 2, 3, 4]),
        [1, 2, 3, 255]
    );
    assert_eq!(
        copy_pixel(NativePixelFormat::Bgra, &[1, 2, 3, 4]),
        [1, 2, 3, 4]
    );
    assert_eq!(
        copy_pixel(NativePixelFormat::Rgbx, &[1, 2, 3, 4]),
        [3, 2, 1, 255]
    );
    assert_eq!(
        copy_pixel(NativePixelFormat::Rgba, &[1, 2, 3, 4]),
        [3, 2, 1, 4]
    );
}

#[test]
fn respects_positive_padding_and_negative_stride() {
    let memory = [1, 0, 0, 255, 9, 9, 9, 9, 2, 0, 0, 255, 8, 8, 8, 8];
    let positive = copy_frame(
        &memory,
        negotiated(NativePixelFormat::Bgra, 1, 2),
        layout(8, memory.len()),
    )
    .expect("positive stride");
    assert_eq!(&*positive.pixels, &[1, 0, 0, 255, 2, 0, 0, 255]);

    let negative = copy_frame(
        &memory,
        negotiated(NativePixelFormat::Bgra, 1, 2),
        layout(-8, memory.len()),
    )
    .expect("negative stride");
    assert_eq!(&*negative.pixels, &[2, 0, 0, 255, 1, 0, 0, 255]);
}

#[test]
fn rejects_invalid_dimensions_stride_ranges_and_crop() {
    for (width, height) in [(0, 1), (1, 0), (MAX_VIDEO_DIMENSION + 1, 1)] {
        assert!(NegotiatedFormat::new(width, height, NativePixelFormat::Bgra).is_err());
    }
    let format = negotiated(NativePixelFormat::Bgra, 2, 2);
    assert!(copy_frame(&[0; 16], format, layout(4, 16)).is_err());
    assert!(copy_frame(&[0; 16], format, layout(8, 15)).is_err());
    assert!(
        copy_frame(
            &[0; 16],
            format,
            BufferLayout {
                crop: Some(CropRect {
                    x: 1,
                    y: 1,
                    width: 2,
                    height: 2,
                }),
                ..layout(8, 16)
            },
        )
        .is_err()
    );
}

#[test]
fn applies_crop_and_each_transform_without_borrowing_input() {
    let memory = [
        1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255, 5, 0, 0, 255, 6, 0, 0, 255,
    ];
    let crop = Some(CropRect {
        x: 1,
        y: 0,
        width: 2,
        height: 2,
    });
    let cases = [
        (VideoTransform::None, 2, 2, vec![2, 3, 5, 6]),
        (VideoTransform::Rotated90, 2, 2, vec![3, 6, 2, 5]),
        (VideoTransform::Rotated180, 2, 2, vec![6, 5, 3, 2]),
        (VideoTransform::Rotated270, 2, 2, vec![5, 2, 6, 3]),
        (VideoTransform::Flipped, 2, 2, vec![3, 2, 6, 5]),
        (VideoTransform::Flipped90, 2, 2, vec![2, 5, 3, 6]),
        (VideoTransform::Flipped180, 2, 2, vec![5, 6, 2, 3]),
        (VideoTransform::Flipped270, 2, 2, vec![6, 3, 5, 2]),
    ];
    for (transform, width, height, expected_blue) in cases {
        let frame = copy_frame(
            &memory,
            negotiated(NativePixelFormat::Bgra, 3, 2),
            BufferLayout {
                crop,
                transform,
                ..layout(12, memory.len())
            },
        )
        .expect("transform should copy");
        assert_eq!((frame.width, frame.height), (width, height));
        assert_eq!(
            frame
                .pixels
                .chunks_exact(4)
                .map(|pixel| pixel[0])
                .collect::<Vec<_>>(),
            expected_blue
        );
    }
}

#[test]
fn native_timestamps_are_anchored_and_monotone() {
    let mut mapper = TimestampMapper::new(1_000);
    let first = mapper
        .map(
            HeaderMetadata {
                pts_ns: Some(80),
                sequence: 1,
                ..Default::default()
            },
            10,
        )
        .expect("first timestamp");
    let second = mapper
        .map(
            HeaderMetadata {
                pts_ns: Some(95),
                sequence: 2,
                ..Default::default()
            },
            20,
        )
        .expect("second timestamp");
    assert_eq!(first.session_ns, 1_000);
    assert_eq!(second.session_ns, 1_015);
    assert_eq!(second.native_pts_ns, Some(95));
    assert_eq!(second.source, TimestampSource::NativePresentation);
}

#[test]
fn arrival_timestamp_source_stays_locked_and_ignores_late_pts() {
    let mut mapper = TimestampMapper::new(50);
    let first = mapper
        .map(HeaderMetadata::default(), 100)
        .expect("arrival timestamp");
    let second = mapper
        .map(
            HeaderMetadata {
                pts_ns: Some(999),
                ..Default::default()
            },
            125,
        )
        .expect("arrival remains selected");
    assert_eq!(first.session_ns, 50);
    assert_eq!(second.session_ns, 75);
    assert_eq!(second.native_pts_ns, None);
    assert_eq!(second.source, TimestampSource::MonotonicArrival);
}

#[test]
fn timestamp_mapper_rejects_flags_regressions_missing_pts_and_overflow() {
    for header in [
        HeaderMetadata {
            gap: true,
            ..Default::default()
        },
        HeaderMetadata {
            corrupted: true,
            ..Default::default()
        },
        HeaderMetadata {
            discont: true,
            ..Default::default()
        },
    ] {
        assert!(TimestampMapper::new(0).map(header, 0).is_err());
    }
    let mut native = TimestampMapper::new(0);
    native
        .map(
            HeaderMetadata {
                pts_ns: Some(5),
                ..Default::default()
            },
            0,
        )
        .expect("initial native timestamp");
    assert!(
        native
            .map(
                HeaderMetadata {
                    pts_ns: Some(4),
                    ..Default::default()
                },
                1
            )
            .is_err()
    );

    let mut missing = TimestampMapper::new(0);
    missing
        .map(
            HeaderMetadata {
                pts_ns: Some(5),
                ..Default::default()
            },
            0,
        )
        .expect("initial native timestamp");
    assert!(missing.map(HeaderMetadata::default(), 1).is_err());

    let mut overflow = TimestampMapper::new(u64::MAX);
    overflow
        .map(
            HeaderMetadata {
                pts_ns: Some(1),
                ..Default::default()
            },
            0,
        )
        .expect("first timestamp fits");
    assert!(
        overflow
            .map(
                HeaderMetadata {
                    pts_ns: Some(2),
                    ..Default::default()
                },
                1
            )
            .is_err()
    );
}

#[test]
fn cursor_spa_id_changes_without_a_bitmap_and_zero_preserves_identity() {
    let mut state = CursorState::new("stream");
    let first = CursorMetadata {
        id: 17,
        x: 4,
        y: 5,
        hotspot: None,
    };
    assert!(matches!(
        state.resolve(Some(first), 10, 10),
        CursorSampleState::Known {
            ref native_cursor_id,
            visible: true,
            ..
        } if native_cursor_id == "pipewire:stream:17"
    ));

    // SPA IDs are the identity even when no bitmap is present in the meta.
    let changed = CursorMetadata { id: 23, ..first };
    assert!(matches!(
        state.resolve(Some(changed), 10, 10),
        CursorSampleState::Known {
            ref native_cursor_id,
            visible: true,
            ..
        } if native_cursor_id == "pipewire:stream:23"
    ));

    let preserved = state.resolve(
        Some(CursorMetadata {
            id: 0,
            x: 6,
            y: 7,
            hotspot: None,
        }),
        10,
        10,
    );
    assert!(matches!(
        preserved,
        CursorSampleState::Known {
            ref native_cursor_id,
            pixel_x: 6,
            pixel_y: 7,
            visible: true,
            ..
        } if native_cursor_id == "pipewire:stream:23"
    ));

    let hidden = state.resolve(
        Some(CursorMetadata {
            id: 0,
            x: -1,
            y: -1,
            hotspot: None,
        }),
        10,
        10,
    );
    assert!(matches!(
        hidden,
        CursorSampleState::Known {
            ref native_cursor_id,
            visible: false,
            ..
        } if native_cursor_id == "pipewire:stream:23"
    ));
}

#[test]
fn cursor_id_zero_without_a_previous_identity_is_unknown() {
    let mut state = CursorState::new("stream");
    assert_eq!(
        state.resolve(
            Some(CursorMetadata {
                id: 0,
                x: 4,
                y: 5,
                hotspot: None,
            }),
            10,
            10,
        ),
        CursorSampleState::Unknown
    );
}

#[test]
fn cursor_meta_allocation_matches_mutter_384_pixel_contract() {
    let minimum = size_of::<pipewire::spa::sys::spa_meta_cursor>()
        + size_of::<pipewire::spa::sys::spa_meta_bitmap>()
        + 384 * 384 * 4;
    assert!(CURSOR_META_SIZE >= minimum);
}

#[test]
fn cursor_position_only_update_preserves_raw_spa_identity() {
    let mut state = CursorState::new("stream");
    let identified = state.resolve(
        Some(CursorMetadata {
            id: 17,
            x: 4,
            y: 5,
            hotspot: None,
        }),
        10,
        10,
    );
    assert!(matches!(
        identified,
        CursorSampleState::Known { ref native_cursor_id, .. }
            if native_cursor_id == "pipewire:stream:17"
    ));

    let moved = state.resolve(
        Some(CursorMetadata {
            id: 0,
            x: 7,
            y: 8,
            hotspot: None,
        }),
        10,
        10,
    );
    assert!(matches!(
        moved,
        CursorSampleState::Known {
            ref native_cursor_id,
            pixel_x: 7,
            pixel_y: 8,
            visible: true,
            ..
        } if native_cursor_id == "pipewire:stream:17"
    ));
}

#[test]
fn cursor_coordinates_keep_signed_values_and_follow_crop_rotation() {
    let metadata = CursorMetadata {
        id: 3,
        x: 12,
        y: 24,
        hotspot: None,
    };
    let mapped = map_cursor_metadata(
        Some(metadata),
        100,
        100,
        Some(CropRect {
            x: 10,
            y: 20,
            width: 30,
            height: 40,
        }),
        VideoTransform::Rotated90,
    )
    .expect("mapped cursor");
    assert_eq!((mapped.x, mapped.y), (4, 27));

    let mut state = CursorState::new("scope");
    let outside = state.resolve(
        Some(CursorMetadata {
            x: -2,
            y: 4,
            ..metadata
        }),
        30,
        40,
    );
    assert!(matches!(
        outside,
        CursorSampleState::Known {
            pixel_x: -2,
            visible: false,
            ..
        }
    ));
}

#[derive(Default)]
struct SinkLog {
    calls: Arc<Mutex<Vec<&'static str>>>,
    fail_push: bool,
}

impl ScreenSampleSink for SinkLog {
    fn begin_segment(&mut self, _: crate::screen::ScreenSegment) -> Result<(), CaptureError> {
        self.calls.lock().expect("log lock").push("begin");
        Ok(())
    }

    fn format_changed(&mut self, _: VideoFormat) -> Result<(), CaptureError> {
        self.calls.lock().expect("log lock").push("format");
        Ok(())
    }

    fn push(&mut self, _: OwnedScreenSample) -> Result<(), CaptureError> {
        self.calls.lock().expect("log lock").push("push");
        if self.fail_push {
            return Err(CaptureError::InvalidConfiguration(
                "sink refused sample".into(),
            ));
        }
        Ok(())
    }

    fn discontinuity(&mut self, _: ScreenDiscontinuity) -> Result<(), CaptureError> {
        self.calls.lock().expect("log lock").push("discontinuity");
        Ok(())
    }

    fn end_segment(&mut self) -> Result<(), CaptureError> {
        self.calls.lock().expect("log lock").push("end");
        Ok(())
    }

    fn finish(&mut self) -> Result<(), CaptureError> {
        self.calls.lock().expect("log lock").push("finish");
        Ok(())
    }
}

fn sample() -> OwnedScreenSample {
    OwnedScreenSample {
        frame: OwnedVideoFrame {
            width: 1,
            height: 1,
            stride: 4,
            pixel_format: PixelFormat::Bgra8,
            pixels: Arc::from([0_u8; 4]),
        },
        timestamp: FrameTimestamp {
            session_ns: 1,
            native_pts_ns: None,
            source: TimestampSource::MonotonicArrival,
        },
        sequence: 1,
        cursor: CursorSampleState::Unknown,
    }
}

#[test]
fn sink_worker_orders_messages_and_always_finishes() {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let sink = SinkLog {
        calls: calls.clone(),
        fail_push: false,
    };
    let (sender, receiver) = crossbeam_channel::unbounded();
    sender
        .send(SinkMessage::Format(video_format(&sample().frame)))
        .expect("format");
    sender.send(SinkMessage::Sample(sample())).expect("sample");
    sender.send(SinkMessage::Finish).expect("finish");
    let fatal = Arc::new(Mutex::new(None));
    sink_worker(Box::new(sink), receiver, fatal).expect("sink succeeds");
    assert_eq!(
        *calls.lock().expect("log lock"),
        ["format", "push", "finish"]
    );
}

#[test]
fn sink_failure_is_stable_and_backpressure_is_visible() {
    let sink = SinkLog {
        fail_push: true,
        ..Default::default()
    };
    let (sender, receiver) = crossbeam_channel::unbounded();
    sender.send(SinkMessage::Sample(sample())).expect("sample");
    sender.send(SinkMessage::Finish).expect("finish");
    let fatal = Arc::new(Mutex::new(None));
    assert!(sink_worker(Box::new(sink), receiver, fatal.clone()).is_err());
    assert_eq!(
        fatal
            .lock()
            .expect("fatal lock")
            .as_ref()
            .map(CaptureError::code),
        Some(NativeCaptureErrorCode::ScreenSinkFailed.as_str())
    );
    let event = backpressure_event(4, 99);
    assert_eq!(event.lost_frames, 4);
    assert_eq!(event.session_ns, 99);
    assert_eq!(
        event.code,
        NativeCaptureErrorCode::ScreenSinkBackpressure.as_str()
    );
}
