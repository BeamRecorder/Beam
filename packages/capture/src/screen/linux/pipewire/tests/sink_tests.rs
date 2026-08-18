use super::*;

use std::sync::mpsc;

#[derive(Default)]
struct SinkLog {
    calls: Arc<Mutex<Vec<&'static str>>>,
    cursor_samples: Arc<Mutex<Vec<(u64, CursorSampleState)>>>,
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

    fn push_cursor(
        &mut self,
        session_ns: u64,
        cursor: CursorSampleState,
    ) -> Result<(), CaptureError> {
        self.calls.lock().expect("log lock").push("cursor");
        self.cursor_samples
            .lock()
            .expect("cursor log lock")
            .push((session_ns, cursor));
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
        cursor_samples: Arc::new(Mutex::new(Vec::new())),
        fail_push: false,
    };
    let (sender, receiver) = crossbeam_channel::unbounded();
    let (_cursor_sender, cursor_receiver) = crossbeam_channel::unbounded();
    sender
        .send(SinkMessage::Format(video_format(&sample().frame)))
        .expect("format");
    sender.send(SinkMessage::Sample(sample())).expect("sample");
    sender.send(SinkMessage::Finish).expect("finish");
    let fatal = Arc::new(Mutex::new(None));
    sink_worker(Box::new(sink), receiver, cursor_receiver, fatal).expect("sink succeeds");
    assert_eq!(
        *calls.lock().expect("log lock"),
        ["format", "push", "finish"]
    );
}

#[test]
fn sink_worker_routes_cursor_messages_through_the_separate_queue() {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let cursor_samples = Arc::new(Mutex::new(Vec::new()));
    let sink = SinkLog {
        calls: calls.clone(),
        cursor_samples: cursor_samples.clone(),
        fail_push: false,
    };
    let cursor = CursorSampleState::Known {
        native_cursor_id: "pipewire:stream:text".into(),
        cursor_kind: CursorKind::Textcursor,
        pixel_x: 31,
        pixel_y: 47,
        normalized_x: 0.31,
        normalized_y: 0.47,
        visible: true,
        hotspot: None,
    };
    let (sender, receiver) = crossbeam_channel::unbounded();
    let (cursor_sender, cursor_receiver) = crossbeam_channel::unbounded();
    sender
        .send(SinkMessage::Format(video_format(&sample().frame)))
        .expect("format");
    sender.send(SinkMessage::Sample(sample())).expect("sample");
    cursor_sender
        .send(CursorMessage {
            session_ns: 12,
            cursor: cursor.clone(),
        })
        .expect("cursor-only update");
    sender.send(SinkMessage::Finish).expect("finish");
    let fatal = Arc::new(Mutex::new(None));
    sink_worker(Box::new(sink), receiver, cursor_receiver, fatal).expect("sink succeeds");

    let calls = calls.lock().expect("log lock");
    assert_eq!(calls.last(), Some(&"finish"));
    assert!(calls.contains(&"format"));
    assert!(calls.contains(&"push"));
    assert!(calls.contains(&"cursor"));
    assert_eq!(
        *cursor_samples.lock().expect("cursor log lock"),
        [(12, cursor)]
    );
}

#[test]
fn sink_worker_drains_cursor_queue_before_end_segment() {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let cursor_samples = Arc::new(Mutex::new(Vec::new()));
    let sink = SinkLog {
        calls: calls.clone(),
        cursor_samples,
        fail_push: false,
    };
    let (sender, receiver) = crossbeam_channel::unbounded();
    let (cursor_sender, cursor_receiver) = crossbeam_channel::unbounded();
    let cursor = CursorSampleState::Unknown;
    cursor_sender
        .send(CursorMessage {
            session_ns: 44,
            cursor,
        })
        .expect("cursor");
    let (reply_sender, reply_receiver) = mpsc::sync_channel(1);
    sender
        .send(SinkMessage::EndSegment(reply_sender))
        .expect("end segment");
    sender.send(SinkMessage::Finish).expect("finish");
    let fatal = Arc::new(Mutex::new(None));

    sink_worker(Box::new(sink), receiver, cursor_receiver, fatal).expect("sink succeeds");
    reply_receiver
        .recv()
        .expect("end segment reply")
        .expect("end segment succeeds");

    let calls = calls.lock().expect("log lock");
    let cursor_index = calls
        .iter()
        .position(|call| *call == "cursor")
        .expect("cursor is drained");
    let end_index = calls
        .iter()
        .position(|call| *call == "end")
        .expect("end segment is called");
    assert!(cursor_index < end_index);
    assert_eq!(calls.last(), Some(&"finish"));
}

#[test]
fn sink_worker_drains_cursor_queue_before_finish() {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let sink = SinkLog {
        calls: calls.clone(),
        ..Default::default()
    };
    let (sender, receiver) = crossbeam_channel::unbounded();
    let (cursor_sender, cursor_receiver) = crossbeam_channel::unbounded();
    cursor_sender
        .send(CursorMessage {
            session_ns: 45,
            cursor: CursorSampleState::Unknown,
        })
        .expect("cursor");
    sender.send(SinkMessage::Finish).expect("finish");
    let fatal = Arc::new(Mutex::new(None));

    sink_worker(Box::new(sink), receiver, cursor_receiver, fatal).expect("sink succeeds");

    let calls = calls.lock().expect("log lock");
    assert_eq!(*calls, ["cursor", "finish"]);
}

#[test]
fn saturated_cursor_queue_coalesces_to_the_latest_position() {
    let (sender, receiver) = crossbeam_channel::bounded(1);
    let mut pending = None;
    let message = |session_ns| CursorMessage {
        session_ns,
        cursor: CursorSampleState::Unknown,
    };

    enqueue_cursor_message(&sender, &mut pending, message(1)).expect("first cursor");
    enqueue_cursor_message(&sender, &mut pending, message(2)).expect("pending cursor");
    enqueue_cursor_message(&sender, &mut pending, message(3)).expect("coalesced cursor");

    assert_eq!(receiver.recv().expect("queued cursor").session_ns, 1);
    flush_cursor_message(&sender, &mut pending).expect("flush latest cursor");
    assert_eq!(receiver.recv().expect("latest cursor").session_ns, 3);
    assert!(pending.is_none());
}

#[test]
fn output_dimensions_follow_crop_and_rotation_for_cursor_only_updates() {
    let format = negotiated(NativePixelFormat::Bgra, 1920, 1080);
    let crop = Some(CropRect {
        x: 100,
        y: 50,
        width: 800,
        height: 600,
    });
    assert_eq!(
        output_dimensions(format, crop, VideoTransform::None).expect("dimensions"),
        (800, 600)
    );
    assert_eq!(
        output_dimensions(format, crop, VideoTransform::Rotated90).expect("dimensions"),
        (600, 800)
    );
    assert!(
        output_dimensions(
            format,
            Some(CropRect {
                x: 1_500,
                y: 0,
                width: 500,
                height: 100,
            }),
            VideoTransform::None,
        )
        .is_err()
    );
}

#[test]
fn sink_failure_is_stable_and_backpressure_is_visible() {
    let sink = SinkLog {
        fail_push: true,
        ..Default::default()
    };
    let (sender, receiver) = crossbeam_channel::unbounded();
    let (_cursor_sender, cursor_receiver) = crossbeam_channel::unbounded();
    sender.send(SinkMessage::Sample(sample())).expect("sample");
    sender.send(SinkMessage::Finish).expect("finish");
    let fatal = Arc::new(Mutex::new(None));
    assert!(sink_worker(Box::new(sink), receiver, cursor_receiver, fatal.clone()).is_err());
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
