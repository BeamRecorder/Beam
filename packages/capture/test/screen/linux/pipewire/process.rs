#![cfg(test)]
#![allow(clippy::panic)]

use std::sync::{Arc, Mutex, mpsc};

use crate::{
    NativeCaptureErrorCode,
    screen::{
        CursorSampleState, FrameTimestamp, OwnedScreenSample, OwnedVideoFrame, PixelFormat,
        ScreenCaptureMetrics, TimestampSource, VideoFormat,
    },
    session::StartGate,
};

use super::*;

struct Fixture {
    state: ProcessState,
    sink: crossbeam_channel::Receiver<SinkMessage>,
    start_reply: mpsc::Receiver<Result<(), CaptureError>>,
}

fn fixture(capacity: usize) -> Fixture {
    let (sink, sink_receiver) = crossbeam_channel::bounded(capacity);
    let (cursor_sink, cursor_receiver) = crossbeam_channel::bounded(1);
    drop(cursor_receiver);
    let (reply, start_reply) = mpsc::sync_channel(1);
    let start_gate = Arc::new(StartGate::new());
    start_gate.release(12).expect("release start gate");
    let state = ProcessState {
        negotiated: Some(
            NegotiatedFormat::new(2, 2, NativePixelFormat::Bgra).expect("valid format"),
        ),
        last_announced: None,
        cursor: CursorState::new("test-stream"),
        timestamp: TimestampMapper::new(0),
        start_gate,
        active: true,
        start_reply: Some(reply),
        stopping: false,
        clock: std::time::Instant::now(),
        sink,
        cursor_sink,
        pending_cursor: None,
        metrics: Arc::new(ScreenCaptureMetrics::default()),
        fatal: Arc::new(Mutex::new(None)),
        pending_drops: 0,
        last_frame_geometry: None,
        repair_window_crop: false,
        region: None,
    };
    Fixture {
        state,
        sink: sink_receiver,
        start_reply,
    }
}

fn video_format() -> VideoFormat {
    VideoFormat {
        width: 2,
        height: 2,
        stride: 8,
        pixel_format: PixelFormat::Bgra8,
    }
}

fn sample(sequence: u64) -> OwnedScreenSample {
    OwnedScreenSample {
        frame: OwnedVideoFrame {
            width: 2,
            height: 2,
            stride: 8,
            pixel_format: PixelFormat::Bgra8,
            pixels: Arc::from(vec![0; 16]),
        },
        timestamp: FrameTimestamp {
            session_ns: sequence,
            native_pts_ns: Some(sequence),
            source: TimestampSource::NativePresentation,
        },
        sequence,
        cursor: CursorSampleState::Unknown,
    }
}

#[test]
fn start_reply_waits_for_the_first_sample_after_format_and_is_sent_only_once() {
    let mut fixture = fixture(1);

    assert!(matches!(
        fixture.start_reply.try_recv(),
        Err(mpsc::TryRecvError::Empty)
    ));
    fixture
        .state
        .sink
        .try_send(SinkMessage::Format(video_format()))
        .expect("queue format");
    assert!(matches!(
        fixture.sink.try_recv().expect("format message"),
        SinkMessage::Format(_)
    ));
    assert!(matches!(
        fixture.start_reply.try_recv(),
        Err(mpsc::TryRecvError::Empty)
    ));

    enqueue_video_sample(&mut fixture.state, sample(1), false);

    assert!(fixture.state.start_reply.is_none());
    assert_eq!(fixture.state.metrics.frames_received(), 1);
    assert!(matches!(
        fixture.sink.try_recv().expect("queued first sample"),
        SinkMessage::Sample(_)
    ));
    assert!(matches!(fixture.start_reply.try_recv(), Ok(Ok(()))));
    assert!(matches!(
        fixture.start_reply.try_recv(),
        Err(mpsc::TryRecvError::Disconnected)
    ));

    enqueue_video_sample(&mut fixture.state, sample(2), false);
    assert!(matches!(
        fixture.start_reply.try_recv(),
        Err(mpsc::TryRecvError::Disconnected)
    ));
}

#[test]
fn a_full_sink_queue_keeps_the_start_reply_until_a_later_sample_is_queued() {
    let mut fixture = fixture(1);
    fixture
        .state
        .sink
        .try_send(SinkMessage::Format(video_format()))
        .expect("fill bounded sink queue");

    enqueue_video_sample(&mut fixture.state, sample(1), false);

    assert!(fixture.state.start_reply.is_some());
    assert_eq!(fixture.state.metrics.frames_received(), 0);
    assert_eq!(fixture.state.metrics.frames_dropped(), 1);
    assert!(matches!(
        fixture.start_reply.try_recv(),
        Err(mpsc::TryRecvError::Empty)
    ));
    assert!(matches!(
        fixture.sink.try_recv().expect("format message"),
        SinkMessage::Format(_)
    ));

    enqueue_video_sample(&mut fixture.state, sample(2), false);

    assert!(fixture.state.start_reply.is_none());
    assert_eq!(fixture.state.metrics.frames_received(), 1);
    assert!(matches!(fixture.start_reply.try_recv(), Ok(Ok(()))));
}

#[test]
fn a_disconnected_sink_fails_the_pending_start_reply() {
    let mut fixture = fixture(1);
    drop(fixture.sink);

    enqueue_video_sample(&mut fixture.state, sample(1), false);

    let error = fixture
        .start_reply
        .try_recv()
        .expect("reply for the failed sink")
        .expect_err("disconnected sink must fail startup");
    assert_eq!(
        error.code(),
        NativeCaptureErrorCode::ScreenSinkFailed.as_str()
    );
    assert!(fixture.state.start_reply.is_none());
    assert_eq!(fixture.state.metrics.frames_received(), 0);
    let fatal = fixture.state.fatal.lock().expect("fatal error lock");
    assert_eq!(
        fatal.as_ref().map(CaptureError::code),
        Some(NativeCaptureErrorCode::ScreenSinkFailed.as_str())
    );
}

#[test]
fn dropping_the_start_reply_receiver_does_not_turn_a_queued_sample_into_failure() {
    let mut fixture = fixture(1);
    drop(fixture.start_reply);

    enqueue_video_sample(&mut fixture.state, sample(1), false);

    assert!(fixture.state.start_reply.is_none());
    assert_eq!(fixture.state.metrics.frames_received(), 1);
    assert_eq!(fixture.state.metrics.frames_dropped(), 0);
    assert!(matches!(
        fixture.sink.try_recv().expect("queued first sample"),
        SinkMessage::Sample(_)
    ));
    assert!(
        fixture
            .state
            .fatal
            .lock()
            .expect("fatal error lock")
            .is_none()
    );
}

#[test]
fn preroll_defers_only_unusable_buffers_before_frame_geometry() {
    for corrupted in [false, true] {
        for chunk_size in [0, 16] {
            assert_eq!(
                should_defer_timestamp_origin(false, corrupted, chunk_size),
                corrupted || chunk_size == 0
            );
            assert!(!should_defer_timestamp_origin(true, corrupted, chunk_size));
        }
    }
}

#[test]
fn cursor_backpressure_retains_only_the_freshest_sample() {
    let (sender, receiver) = crossbeam_channel::bounded(1);
    let mut pending = None;
    let message = |session_ns| CursorMessage {
        session_ns,
        cursor: CursorSampleState::Unknown,
    };
    assert!(enqueue_cursor_message(&sender, &mut pending, message(1)).is_ok());
    assert!(enqueue_cursor_message(&sender, &mut pending, message(2)).is_ok());
    assert_eq!(pending.as_ref().map(|item| item.session_ns), Some(2));
    assert!(enqueue_cursor_message(&sender, &mut pending, message(3)).is_ok());
    assert_eq!(pending.as_ref().map(|item| item.session_ns), Some(3));
    assert_eq!(receiver.try_recv().map(|item| item.session_ns), Ok(1));
    assert!(enqueue_cursor_message(&sender, &mut pending, message(4)).is_ok());
    assert_eq!(receiver.try_recv().map(|item| item.session_ns), Ok(3));
    assert_eq!(pending.as_ref().map(|item| item.session_ns), Some(4));
    assert!(flush_cursor_message(&sender, &mut pending).is_ok());
    assert_eq!(receiver.try_recv().map(|item| item.session_ns), Ok(4));
    assert!(pending.is_none());
    assert!(flush_cursor_message(&sender, &mut pending).is_ok());
}

#[test]
fn disconnected_cursor_sink_reports_failure_without_blocking() {
    let (sender, receiver) = crossbeam_channel::bounded(1);
    drop(receiver);
    let mut pending = None;
    assert!(
        enqueue_cursor_message(
            &sender,
            &mut pending,
            CursorMessage {
                session_ns: 1,
                cursor: CursorSampleState::Unknown,
            }
        )
        .is_err()
    );
    pending = Some(CursorMessage {
        session_ns: 2,
        cursor: CursorSampleState::Unknown,
    });
    assert!(flush_cursor_message(&sender, &mut pending).is_err());
    assert!(pending.is_none());
}

#[test]
fn flush_pending_cursor_marks_a_disconnected_worker_fatal() {
    let mut fixture = fixture(1);
    fixture.state.pending_cursor = Some(CursorMessage {
        session_ns: 10,
        cursor: CursorSampleState::Unknown,
    });
    flush_pending_cursor(&mut fixture.state);
    assert!(fixture.state.pending_cursor.is_none());
    assert_eq!(
        fixture
            .state
            .fatal
            .lock()
            .ok()
            .and_then(|fatal| fatal.as_ref().map(CaptureError::code)),
        Some(NativeCaptureErrorCode::ScreenSinkFailed.as_str())
    );
}

#[test]
fn video_sample_with_cursor_updates_metrics_and_native_timestamp() {
    let mut fixture = fixture(2);
    enqueue_video_sample(&mut fixture.state, sample(42), true);
    assert_eq!(fixture.state.metrics.frames_received(), 1);
    assert_eq!(fixture.state.metrics.cursor_samples(), 1);
    assert_eq!(fixture.state.metrics.last_native_pts_ns(), Some(42));
    assert!(matches!(fixture.start_reply.try_recv(), Ok(Ok(()))));
}

#[test]
fn backpressure_event_carries_the_lost_count_and_session_position() {
    let event = backpressure_event(7, 1_234);
    assert_eq!(event.lost_frames, 7);
    assert_eq!(event.session_ns, 1_234);
    assert_eq!(
        event.code,
        NativeCaptureErrorCode::ScreenSinkBackpressure.as_str()
    );
}

#[path = "process_decoded.rs"]
mod decoded_checks;

#[test]
fn decoded_full_format_queue_counts_drop_without_starting_session() {
    let mut fixture = fixture(0);
    process_decoded_buffer(
        &mut fixture.state,
        decoded_checks::format_2x2(),
        decoded_checks::decoded(
            HeaderMetadata::default(),
            1,
            Some(decoded_checks::plane(Some(&decoded_checks::PIXELS))),
        ),
    );
    assert_eq!(fixture.state.metrics.frames_dropped(), 1);
    assert_eq!(fixture.state.pending_drops, 1);
    assert!(fixture.state.last_announced.is_none());
    assert!(fixture.state.start_reply.is_some());
    assert!(fixture.state.fatal.lock().expect("fatal").is_none());
}

#[test]
fn decoded_regressing_native_pts_reports_timestamp_discontinuity() {
    let mut fixture = fixture(3);
    for pts in [20, 10] {
        process_decoded_buffer(
            &mut fixture.state,
            decoded_checks::format_2x2(),
            decoded_checks::decoded(
                HeaderMetadata {
                    pts_ns: Some(pts),
                    ..Default::default()
                },
                1,
                Some(decoded_checks::plane(Some(&decoded_checks::PIXELS))),
            ),
        );
    }
    assert!(matches!(
        fixture.sink.try_recv(),
        Ok(SinkMessage::Format(_))
    ));
    assert!(matches!(
        fixture.sink.try_recv(),
        Ok(SinkMessage::Sample(_))
    ));
    let SinkMessage::Discontinuity(event) = fixture.sink.try_recv().expect("regression") else {
        panic!("expected discontinuity");
    };
    assert_eq!(event.code, "pipewire-timestamp-discontinuity");
    assert_eq!(fixture.state.metrics.frames_dropped(), 1);
}

#[test]
fn decoded_invalid_region_is_fatal_without_announcing_format() {
    let mut fixture = fixture(2);
    fixture.state.region = Some(crate::model::ScreenRegion {
        x: 0.8,
        y: 0.0,
        width: 0.5,
        height: 1.0,
    });
    process_decoded_buffer(
        &mut fixture.state,
        decoded_checks::format_2x2(),
        decoded_checks::decoded(
            HeaderMetadata::default(),
            1,
            Some(decoded_checks::plane(Some(&decoded_checks::PIXELS))),
        ),
    );
    assert_eq!(
        fixture
            .state
            .fatal
            .lock()
            .expect("fatal")
            .as_ref()
            .map(CaptureError::code),
        Some("invalid-configuration")
    );
    assert!(fixture.sink.is_empty());
    assert!(fixture.state.start_reply.is_some());
}

#[test]
fn decoded_repair_crop_rejects_invalid_memory_without_latching_geometry() {
    let mut fixture = fixture(2);
    fixture.state.repair_window_crop = true;
    let mut video_plane = decoded_checks::plane(Some(&decoded_checks::PIXELS));
    video_plane.layout.stride = 7;
    process_decoded_buffer(
        &mut fixture.state,
        decoded_checks::format_2x2(),
        decoded_checks::decoded(HeaderMetadata::default(), 1, Some(video_plane)),
    );
    assert!(fixture.state.last_frame_geometry.is_none());
    assert_eq!(fixture.state.metrics.frames_dropped(), 1);
    assert!(matches!(
        fixture.sink.try_recv(),
        Ok(SinkMessage::Discontinuity(_))
    ));
}
