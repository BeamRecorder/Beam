use super::*;
use pipewire::spa::buffer::DataType;

pub(super) const PIXELS: [u8; 16] = [7; 16];

pub(super) fn plane<'a>(memory: Option<&'a [u8]>) -> PlaneData<'a> {
    PlaneData {
        layout: BufferLayout {
            offset: 0,
            size: 16,
            stride: 8,
            crop: None,
            transform: VideoTransform::None,
        },
        corrupted: false,
        memory_type: DataType::MemPtr,
        memory,
    }
}

pub(super) fn decoded<'a>(
    header: HeaderMetadata,
    plane_count: usize,
    plane: Option<PlaneData<'a>>,
) -> DecodedBuffer<'a> {
    DecodedBuffer {
        header,
        cursor: None,
        reported_crop: None,
        transform: VideoTransform::None,
        plane_count,
        plane,
        arrival_ns: 100,
    }
}

pub(super) fn format_2x2() -> NegotiatedFormat {
    NegotiatedFormat::new(2, 2, NativePixelFormat::Bgra).expect("fixture format")
}

fn fatal_code(state: &ProcessState) -> Option<String> {
    state
        .fatal
        .lock()
        .expect("fatal lock")
        .as_ref()
        .map(|error| error.code().to_owned())
}

#[test]
fn decoded_plane_counts_and_missing_plane_emit_invalid_buffer_discontinuities() {
    for (count, video_plane) in [(0, None), (2, None), (1, None)] {
        let mut fixture = fixture(2);
        process_decoded_buffer(
            &mut fixture.state,
            format_2x2(),
            decoded(HeaderMetadata::default(), count, video_plane),
        );
        assert_eq!(fixture.state.metrics.frames_dropped(), 1);
        assert_eq!(fixture.state.metrics.frames_received(), 0);
        assert!(fixture.state.start_reply.is_some());
        let SinkMessage::Discontinuity(event) = fixture.sink.try_recv().expect("discontinuity")
        else {
            panic!("expected discontinuity");
        };
        assert_eq!(
            event.code,
            NativeCaptureErrorCode::PipewireBufferInvalid.as_str()
        );
        assert_eq!(event.lost_frames, 1);
        assert_eq!(event.session_ns, 0);
    }
}

#[test]
fn unusable_preroll_defers_clock_until_first_frame_but_not_after_geometry() {
    for corrupted in [false, true] {
        let mut fixture = fixture(3);
        let mut bad = plane(Some(&PIXELS));
        bad.corrupted = corrupted;
        bad.layout.size = if corrupted { 16 } else { 0 };
        process_decoded_buffer(
            &mut fixture.state,
            format_2x2(),
            decoded(
                HeaderMetadata {
                    pts_ns: Some(10),
                    ..Default::default()
                },
                1,
                Some(bad),
            ),
        );
        assert!(fixture.sink.is_empty());
        assert_eq!(fixture.state.metrics.frames_dropped(), 0);
        process_decoded_buffer(
            &mut fixture.state,
            format_2x2(),
            decoded(
                HeaderMetadata {
                    pts_ns: Some(20),
                    ..Default::default()
                },
                1,
                Some(plane(Some(&PIXELS))),
            ),
        );
        assert!(matches!(
            fixture.sink.try_recv(),
            Ok(SinkMessage::Format(_))
        ));
        let SinkMessage::Sample(sample) = fixture.sink.try_recv().expect("first frame") else {
            panic!("expected frame");
        };
        assert_eq!(sample.timestamp.session_ns, 0);
        assert_eq!(sample.timestamp.native_pts_ns, Some(20));
        assert!(matches!(fixture.start_reply.try_recv(), Ok(Ok(()))));
        let mut later = plane(Some(&PIXELS));
        later.corrupted = corrupted;
        later.layout.size = if corrupted { 16 } else { 0 };
        process_decoded_buffer(
            &mut fixture.state,
            format_2x2(),
            decoded(
                HeaderMetadata {
                    pts_ns: Some(21),
                    ..Default::default()
                },
                1,
                Some(later),
            ),
        );
        let SinkMessage::Discontinuity(event) =
            fixture.sink.try_recv().expect("invalid later chunk")
        else {
            panic!("expected discontinuity");
        };
        assert_eq!(event.session_ns, 1);
        assert_eq!(fixture.state.metrics.frames_dropped(), 1);
    }
}

#[test]
fn decoded_timestamp_discontinuity_drops_without_announcing_format() {
    for header in [
        HeaderMetadata {
            discont: true,
            ..Default::default()
        },
        HeaderMetadata {
            corrupted: true,
            ..Default::default()
        },
        HeaderMetadata {
            gap: true,
            ..Default::default()
        },
    ] {
        let mut fixture = fixture(1);
        process_decoded_buffer(
            &mut fixture.state,
            format_2x2(),
            decoded(header, 1, Some(plane(Some(&PIXELS)))),
        );
        assert_eq!(fixture.state.metrics.frames_dropped(), 1);
        let SinkMessage::Discontinuity(event) = fixture.sink.try_recv().expect("timestamp event")
        else {
            panic!("expected discontinuity");
        };
        assert_eq!(event.code, "pipewire-timestamp-discontinuity");
        assert!(fixture.state.last_announced.is_none());
    }
}

#[test]
fn unsupported_or_unmappable_memory_is_fatal_before_start_reply() {
    for (memory_type, memory) in [
        (DataType::MemId, Some(&PIXELS[..])),
        (DataType::Invalid, Some(&PIXELS[..])),
        (DataType::DmaBuf, None),
        (DataType::MemFd, None),
    ] {
        let mut fixture = fixture(2);
        let mut video_plane = plane(memory);
        video_plane.memory_type = memory_type;
        process_decoded_buffer(
            &mut fixture.state,
            format_2x2(),
            decoded(HeaderMetadata::default(), 1, Some(video_plane)),
        );
        assert_eq!(
            fatal_code(&fixture.state).as_deref(),
            Some(NativeCaptureErrorCode::PipewireMemoryUnsupported.as_str())
        );
        assert!(fixture.state.start_reply.is_some());
        assert!(fixture.sink.is_empty());
    }
}

#[test]
fn invalid_layouts_drop_frame_and_keep_pipeline_alive() {
    for (offset, size, stride, crop) in [
        (usize::MAX, 16, 8, None),
        (1, 16, 8, None),
        (0, 15, 8, None),
        (0, 16, 7, None),
        (
            0,
            16,
            8,
            Some(CropRect {
                x: 2,
                y: 0,
                width: 1,
                height: 1,
            }),
        ),
        (
            0,
            16,
            8,
            Some(CropRect {
                x: 0,
                y: 0,
                width: 0,
                height: 1,
            }),
        ),
    ] {
        let mut fixture = fixture(2);
        let mut video_plane = plane(Some(&PIXELS));
        video_plane.layout.offset = offset;
        video_plane.layout.size = size;
        video_plane.layout.stride = stride;
        video_plane.layout.crop = crop;
        let mut buffer = decoded(HeaderMetadata::default(), 1, Some(video_plane));
        buffer.reported_crop = crop;
        process_decoded_buffer(&mut fixture.state, format_2x2(), buffer);
        assert_eq!(
            fixture.state.metrics.frames_dropped(),
            1,
            "offset={offset} size={size} stride={stride} crop={crop:?}"
        );
        assert!(matches!(
            fixture.sink.try_recv(),
            Ok(SinkMessage::Discontinuity(_))
        ));
        assert!(fatal_code(&fixture.state).is_none());
    }
}

#[test]
fn valid_frames_announce_format_once_and_preserve_native_timing() {
    let mut fixture = fixture(4);
    for (sequence, pts) in [(1, 10), (2, 15)] {
        process_decoded_buffer(
            &mut fixture.state,
            format_2x2(),
            decoded(
                HeaderMetadata {
                    pts_ns: Some(pts),
                    sequence,
                    ..Default::default()
                },
                1,
                Some(plane(Some(&PIXELS))),
            ),
        );
    }
    let SinkMessage::Format(format) = fixture.sink.try_recv().expect("format") else {
        panic!("expected format");
    };
    assert_eq!(format, video_format());
    for (sequence, session_ns) in [(1, 0), (2, 5)] {
        let SinkMessage::Sample(sample) = fixture.sink.try_recv().expect("sample") else {
            panic!("expected sample");
        };
        assert_eq!(sample.sequence, sequence);
        assert_eq!(sample.timestamp.session_ns, session_ns);
        assert_eq!(&*sample.frame.pixels, &PIXELS);
    }
    assert_eq!(fixture.state.metrics.format_changes(), 1);
    assert_eq!(fixture.state.metrics.last_native_pts_ns(), Some(15));
    assert!(matches!(fixture.start_reply.try_recv(), Ok(Ok(()))));
}

#[test]
fn geometry_and_region_crop_change_announced_format_and_pixels() {
    let mut fixture = fixture(2);
    let pixels = [7; 32];
    let mut video_plane = plane(Some(&pixels));
    video_plane.layout.size = 32;
    video_plane.layout.stride = 16;
    fixture.state.region = Some(crate::model::ScreenRegion {
        x: 0.5,
        y: 0.0,
        width: 0.5,
        height: 1.0,
    });
    process_decoded_buffer(
        &mut fixture.state,
        NegotiatedFormat::new(4, 2, NativePixelFormat::Bgra).expect("source format"),
        decoded(HeaderMetadata::default(), 1, Some(video_plane)),
    );
    let SinkMessage::Format(format) = fixture.sink.try_recv().expect("cropped format") else {
        panic!("expected format");
    };
    assert_eq!((format.width, format.height, format.stride), (2, 2, 8));
    let SinkMessage::Sample(sample) = fixture.sink.try_recv().expect("cropped sample") else {
        panic!("expected sample");
    };
    assert_eq!(
        (
            sample.frame.width,
            sample.frame.height,
            sample.frame.pixels.len()
        ),
        (2, 2, 16)
    );
}

#[test]
fn decoded_backpressure_flushes_lost_count_before_recovered_sample() {
    let mut fixture = fixture(2);
    let frame = |sequence| {
        decoded(
            HeaderMetadata {
                sequence,
                ..Default::default()
            },
            1,
            Some(plane(Some(&PIXELS))),
        )
    };
    process_decoded_buffer(&mut fixture.state, format_2x2(), frame(1));
    process_decoded_buffer(&mut fixture.state, format_2x2(), frame(2));
    assert_eq!(fixture.state.metrics.frames_received(), 1);
    assert_eq!(fixture.state.metrics.frames_dropped(), 1);
    assert_eq!(fixture.state.pending_drops, 1);
    assert!(matches!(
        fixture.sink.try_recv(),
        Ok(SinkMessage::Format(_))
    ));
    assert!(matches!(
        fixture.sink.try_recv(),
        Ok(SinkMessage::Sample(_))
    ));
    process_decoded_buffer(&mut fixture.state, format_2x2(), frame(3));
    let SinkMessage::Discontinuity(event) = fixture.sink.try_recv().expect("backpressure event")
    else {
        panic!("expected backpressure event");
    };
    assert_eq!(
        event.code,
        NativeCaptureErrorCode::ScreenSinkBackpressure.as_str()
    );
    assert_eq!(event.lost_frames, 1);
    assert_eq!(fixture.state.pending_drops, 0);
    let SinkMessage::Sample(sample) = fixture.sink.try_recv().expect("recovered frame") else {
        panic!("expected frame");
    };
    assert_eq!(sample.sequence, 3);
}

#[test]
fn disconnected_sink_during_first_format_is_fatal_and_does_not_start() {
    let mut fixture = fixture(2);
    drop(fixture.sink);
    process_decoded_buffer(
        &mut fixture.state,
        format_2x2(),
        decoded(HeaderMetadata::default(), 1, Some(plane(Some(&PIXELS)))),
    );
    assert_eq!(
        fatal_code(&fixture.state).as_deref(),
        Some(NativeCaptureErrorCode::ScreenSinkFailed.as_str())
    );
    assert!(fixture.state.start_reply.is_some());
}

#[test]
fn cursor_only_chunk_uses_prior_geometry_without_repeating_video_frame() {
    let mut fixture = fixture(3);
    let (cursor_sender, cursor_receiver) = crossbeam_channel::bounded(2);
    fixture.state.cursor_sink = cursor_sender;
    process_decoded_buffer(
        &mut fixture.state,
        format_2x2(),
        decoded(HeaderMetadata::default(), 1, Some(plane(Some(&PIXELS)))),
    );
    assert!(matches!(
        fixture.sink.try_recv(),
        Ok(SinkMessage::Format(_))
    ));
    assert!(matches!(
        fixture.sink.try_recv(),
        Ok(SinkMessage::Sample(_))
    ));
    let mut buffer = decoded(
        HeaderMetadata {
            sequence: 2,
            ..Default::default()
        },
        1,
        Some(plane(Some(&PIXELS))),
    );
    buffer.plane.as_mut().expect("plane").corrupted = true;
    buffer.cursor = Some(CursorMetadata {
        id: 1,
        shape_id: None,
        x: 1,
        y: 1,
        hotspot: None,
        cursor_kind: None,
    });
    process_decoded_buffer(&mut fixture.state, format_2x2(), buffer);
    assert!(fixture.sink.is_empty());
    let cursor = cursor_receiver.try_recv().expect("cursor sidecar");
    assert_eq!(cursor.session_ns, 0);
    assert!(matches!(
        cursor.cursor,
        CursorSampleState::Known {
            pixel_x: 1,
            pixel_y: 1,
            ..
        }
    ));
    assert_eq!(fixture.state.metrics.frames_received(), 1);
    assert_eq!(fixture.state.metrics.frames_dropped(), 0);
}

#[test]
fn negotiated_format_change_is_announced_before_new_sample() {
    let mut fixture = fixture(2);
    process_decoded_buffer(
        &mut fixture.state,
        format_2x2(),
        decoded(HeaderMetadata::default(), 1, Some(plane(Some(&PIXELS)))),
    );
    assert!(matches!(
        fixture.sink.try_recv(),
        Ok(SinkMessage::Format(_))
    ));
    assert!(matches!(
        fixture.sink.try_recv(),
        Ok(SinkMessage::Sample(_))
    ));
    let smaller = NegotiatedFormat::new(1, 2, NativePixelFormat::Bgra).expect("new format");
    let mut video_plane = plane(Some(&PIXELS[..8]));
    video_plane.layout.size = 8;
    video_plane.layout.stride = 4;
    process_decoded_buffer(
        &mut fixture.state,
        smaller,
        decoded(
            HeaderMetadata {
                sequence: 2,
                ..Default::default()
            },
            1,
            Some(video_plane),
        ),
    );
    let SinkMessage::Format(format) = fixture.sink.try_recv().expect("changed format") else {
        panic!("expected format");
    };
    assert_eq!((format.width, format.height), (1, 2));
    let SinkMessage::Sample(sample) = fixture.sink.try_recv().expect("changed frame") else {
        panic!("expected frame");
    };
    assert_eq!(
        (sample.frame.width, sample.frame.height, sample.sequence),
        (1, 2, 2)
    );
    assert_eq!(fixture.state.metrics.format_changes(), 2);
}

#[test]
fn all_cpu_mappable_memory_types_can_supply_a_valid_frame() {
    for memory_type in [DataType::MemPtr, DataType::MemFd, DataType::DmaBuf] {
        let mut fixture = fixture(2);
        let mut video_plane = plane(Some(&PIXELS));
        video_plane.memory_type = memory_type;
        process_decoded_buffer(
            &mut fixture.state,
            format_2x2(),
            decoded(HeaderMetadata::default(), 1, Some(video_plane)),
        );
        assert!(matches!(
            fixture.sink.try_recv(),
            Ok(SinkMessage::Format(_))
        ));
        assert!(matches!(
            fixture.sink.try_recv(),
            Ok(SinkMessage::Sample(_))
        ));
        assert!(fatal_code(&fixture.state).is_none());
    }
}
