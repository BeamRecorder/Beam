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
        dmabuf_importer: DmaBufImporter::new(),
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
