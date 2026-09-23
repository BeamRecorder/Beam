use std::{
    cell::RefCell,
    rc::Rc,
    sync::mpsc,
    sync::{Arc, Mutex},
    time::Instant,
};

use crossbeam_channel::{Sender, TrySendError};
use pipewire::{
    self as pw,
    spa::buffer::{ChunkFlags, DataType},
};

use crate::{
    CaptureError, NativeCaptureErrorCode,
    gate::StartGate,
    model::ScreenRegion,
    screen::{
        CursorSampleState, OwnedScreenSample, ScreenCaptureMetrics, ScreenDiscontinuity,
        ScreenSegment, VideoFormat,
    },
};

use super::{
    BufferLayout, CropRect, CursorMetadata, CursorState, FrameGeometry, HeaderMetadata,
    NegotiatedFormat, TimestampMapper, VideoTransform, copy_frame, crop_frame,
    expand_crop_to_content, has_fatal, metadata, repaired_window_crop, set_fatal, sink_error,
    video_format,
};

pub(super) enum SinkMessage {
    BeginSegment(ScreenSegment, mpsc::SyncSender<Result<(), CaptureError>>),
    Format(VideoFormat),
    Sample(OwnedScreenSample),
    Discontinuity(ScreenDiscontinuity),
    EndSegment(mpsc::SyncSender<Result<(), CaptureError>>),
    Finish,
}

pub(super) struct CursorMessage {
    pub(super) session_ns: u64,
    pub(super) cursor: CursorSampleState,
}

pub(super) struct ProcessState {
    pub cursor_allocations: std::collections::HashMap<usize, usize>,
    pub negotiated: Option<NegotiatedFormat>,
    pub last_announced: Option<VideoFormat>,
    pub cursor: CursorState,
    pub timestamp: TimestampMapper,
    pub start_gate: Arc<StartGate>,
    pub active: bool,
    pub start_reply: Option<mpsc::SyncSender<Result<(), CaptureError>>>,
    pub stopping: bool,
    pub clock: Instant,
    pub sink: Sender<SinkMessage>,
    pub cursor_sink: Sender<CursorMessage>,
    pub pending_cursor: Option<CursorMessage>,
    pub metrics: Arc<ScreenCaptureMetrics>,
    pub fatal: Arc<Mutex<Option<CaptureError>>>,
    pub pending_drops: u64,
    pub last_frame_geometry: Option<FrameGeometry>,
    pub repair_window_crop: bool,
    pub region: Option<ScreenRegion>,
}

pub(super) struct PlaneData<'a> {
    pub layout: BufferLayout,
    pub corrupted: bool,
    pub memory_type: DataType,
    pub memory: Option<&'a [u8]>,
}

pub(super) struct DecodedBuffer<'a> {
    pub header: HeaderMetadata,
    pub cursor: Option<CursorMetadata>,
    pub reported_crop: Option<CropRect>,
    pub transform: VideoTransform,
    pub plane_count: usize,
    pub plane: Option<PlaneData<'a>>,
    pub arrival_ns: u64,
}

pub(super) fn should_defer_timestamp_origin(
    has_frame_geometry: bool,
    corrupted: bool,
    chunk_size: u32,
) -> bool {
    !has_frame_geometry && (corrupted || chunk_size == 0)
}

pub(super) fn process_buffer(stream: &pw::stream::Stream, state: &Rc<RefCell<ProcessState>>) {
    let mut state = state.borrow_mut();
    if has_fatal(&state.fatal) {
        return;
    }
    // A PipeWire process notification must always be drained. During native
    // preparation the stream can become active just before StartGate is
    // released; leaving those buffers queued starves the stream and no later
    // notification arrives for the first real recording frame.
    let Some(mut buffer) = stream.dequeue_buffer() else {
        return;
    };
    if !state.active || !state.start_gate.is_released() {
        return;
    }
    let Some(format) = state.negotiated else {
        set_fatal(
            &state.fatal,
            super::format_error("received a buffer before format negotiation"),
        );
        return;
    };
    let header = metadata::header(&buffer);
    let cursor = {
        let ProcessState {
            cursor,
            cursor_allocations,
            ..
        } = &mut *state;
        metadata::cursor(&buffer, cursor.classifier_mut(), cursor_allocations)
    };
    let reported_crop = metadata::crop(&buffer);
    let transform = metadata::transform(&buffer);
    let datas = buffer.datas_mut();
    let plane_count = datas.len();
    let plane = if let [data] = datas {
        let chunk = data.chunk();
        let layout = BufferLayout {
            offset: usize::try_from(chunk.offset()).unwrap_or(usize::MAX),
            size: usize::try_from(chunk.size()).unwrap_or(usize::MAX),
            stride: chunk.stride(),
            crop: reported_crop,
            transform,
        };
        let corrupted = chunk.flags().contains(ChunkFlags::CORRUPTED);
        let memory_type = data.type_();
        let memory = if !corrupted
            && layout.size != 0
            && matches!(
                memory_type,
                DataType::MemPtr | DataType::MemFd | DataType::DmaBuf
            ) {
            data.data().map(|data| &*data)
        } else {
            None
        };
        Some(PlaneData {
            layout,
            corrupted,
            memory_type,
            memory,
        })
    } else {
        None
    };
    let arrival_ns = u64::try_from(state.clock.elapsed().as_nanos()).unwrap_or(u64::MAX);
    process_decoded_buffer(
        &mut state,
        format,
        DecodedBuffer {
            header,
            cursor,
            reported_crop,
            transform,
            plane_count,
            plane,
            arrival_ns,
        },
    );
}

pub(super) fn process_decoded_buffer(
    state: &mut ProcessState,
    format: NegotiatedFormat,
    buffer: DecodedBuffer<'_>,
) {
    let DecodedBuffer {
        header,
        cursor,
        reported_crop,
        transform,
        plane_count,
        plane,
        arrival_ns,
    } = buffer;
    let has_cursor_metadata = cursor.as_ref().is_some_and(|cursor| cursor.id != 0);
    // Mutter may publish cursor-only buffers before the first window frame.
    // They cannot be mapped without frame geometry and must not establish the
    // session clock origin, otherwise the cursor timeline starts ahead of the
    // encoded video by the wait for that first usable frame.
    let defer_unusable_preroll = plane.as_ref().is_some_and(|plane| {
        should_defer_timestamp_origin(
            state.last_frame_geometry.is_some(),
            plane.corrupted,
            u32::try_from(plane.layout.size).unwrap_or(u32::MAX),
        )
    });
    if defer_unusable_preroll {
        return;
    }
    let timestamp = match state.timestamp.map(header, arrival_ns) {
        Ok(timestamp) => timestamp,
        Err(event) => {
            state.metrics.dropped_frames(1);
            try_discontinuity(state, event);
            return;
        }
    };
    if plane_count != 1 {
        invalid_buffer(
            state,
            timestamp.session_ns,
            "expected exactly one video plane",
        );
        return;
    }
    let Some(plane) = plane else {
        invalid_buffer(state, timestamp.session_ns, "missing video plane");
        return;
    };
    // Mutter deliberately queues cursor-only updates with an empty video chunk
    // flagged CORRUPTED. The MetaCursor payload remains valid and must reach the
    // sidecar without duplicating the previous video frame.
    if plane.corrupted || plane.layout.size == 0 {
        let Some(geometry) = state.last_frame_geometry else {
            return;
        };
        let cursor = geometry.map_cursor(cursor, format);
        let sample_cursor = state
            .cursor
            .resolve(cursor, geometry.width(), geometry.height());
        if has_cursor_metadata && matches!(sample_cursor, CursorSampleState::Known { .. }) {
            try_cursor_sample(state, timestamp.session_ns, sample_cursor);
        } else {
            invalid_buffer(
                state,
                timestamp.session_ns,
                "PipeWire delivered an empty or corrupted video chunk without cursor metadata",
            );
        }
        return;
    }
    let memory_type = plane.memory_type;
    if !matches!(
        memory_type,
        DataType::MemPtr | DataType::MemFd | DataType::DmaBuf
    ) {
        set_fatal(
            &state.fatal,
            CaptureError::native(
                NativeCaptureErrorCode::PipewireMemoryUnsupported,
                format!("unsupported PipeWire memory type {memory_type:?}"),
            ),
        );
        return;
    }
    let mut frame_crop = reported_crop;
    let mut cursor_crop = reported_crop;
    let mut frame_transform = transform;
    let layout = plane.layout;
    let Some(memory) = plane.memory else {
        set_fatal(
            &state.fatal,
            CaptureError::native(
                NativeCaptureErrorCode::PipewireMemoryUnsupported,
                format!("PipeWire memory {memory_type:?} is not CPU-mappable"),
            ),
        );
        return;
    };
    if state.last_frame_geometry.is_none() && state.repair_window_crop {
        let content_crop = match expand_crop_to_content(memory, format, layout) {
            Ok(content_crop) => content_crop,
            Err(error) => {
                invalid_buffer(state, timestamp.session_ns, &error.to_string());
                return;
            }
        };
        frame_crop = repaired_window_crop(reported_crop, content_crop);
    } else if let Some(geometry) = state.last_frame_geometry {
        frame_crop = geometry.frame_crop;
        cursor_crop = geometry.cursor_crop;
        frame_transform = geometry.transform;
    }
    let layout = BufferLayout {
        crop: frame_crop,
        transform: frame_transform,
        ..layout
    };
    let uncropped_frame = match copy_frame(memory, format, layout) {
        Ok(frame) => frame,
        Err(error) => {
            invalid_buffer(state, timestamp.session_ns, &error.to_string());
            return;
        }
    };
    let (frame, region_crop) = match crop_frame(uncropped_frame, state.region) {
        Ok(result) => result,
        Err(error) => {
            set_fatal(&state.fatal, error);
            return;
        }
    };
    let geometry = FrameGeometry::from_frame(
        format,
        frame_crop,
        cursor_crop,
        frame_transform,
        region_crop,
        &frame,
    );
    let cursor = geometry.map_cursor(cursor, format);
    let sample_cursor = state.cursor.resolve(cursor, frame.width, frame.height);
    state.last_frame_geometry = Some(geometry);
    let announced = video_format(&frame);
    state.metrics.observe_video_format(announced);
    if state.last_announced != Some(announced) {
        if let Err(error) = state.sink.try_send(SinkMessage::Format(announced)) {
            match error {
                TrySendError::Full(_) => {
                    state.metrics.dropped_frames(1);
                    state.pending_drops = state.pending_drops.saturating_add(1);
                    return;
                }
                TrySendError::Disconnected(_) => {
                    set_fatal(&state.fatal, sink_error("screen sink channel disconnected"));
                    return;
                }
            }
        }
        state.metrics.changed_format();
        state.last_announced = Some(announced);
    }
    flush_pending_drops(state, timestamp.session_ns);
    let has_cursor = matches!(sample_cursor, CursorSampleState::Known { .. });
    if has_cursor {
        try_cursor_sample(state, timestamp.session_ns, sample_cursor.clone());
    }
    let sample = OwnedScreenSample {
        frame,
        timestamp,
        sequence: header.sequence,
        cursor: CursorSampleState::Unknown,
    };
    enqueue_video_sample(state, sample, has_cursor);
}

pub(super) fn enqueue_video_sample(
    state: &mut ProcessState,
    sample: OwnedScreenSample,
    has_cursor: bool,
) {
    let native_pts = sample.timestamp.native_pts_ns;
    match state.sink.try_send(SinkMessage::Sample(sample)) {
        Ok(()) => {
            state.metrics.received_frame(native_pts, has_cursor);
            // Format and this first usable image now precede any Stop in the
            // sink queue. Only now may the session advertise Recording.
            if let Some(reply) = state.start_reply.take() {
                let _ = reply.send(Ok(()));
            }
        }
        Err(TrySendError::Full(_)) => {
            state.metrics.dropped_frames(1);
            state.pending_drops = state.pending_drops.saturating_add(1);
        }
        Err(TrySendError::Disconnected(_)) => {
            set_fatal(&state.fatal, sink_error("screen sink channel disconnected"));
            if let Some(reply) = state.start_reply.take() {
                let _ = reply.send(Err(sink_error("screen sink channel disconnected")));
            }
        }
    }
}

fn try_cursor_sample(state: &mut ProcessState, session_ns: u64, cursor: CursorSampleState) {
    if enqueue_cursor_message(
        &state.cursor_sink,
        &mut state.pending_cursor,
        CursorMessage { session_ns, cursor },
    )
    .is_err()
    {
        set_fatal(&state.fatal, sink_error("cursor sink channel disconnected"));
    }
}

pub(super) fn flush_pending_cursor(state: &mut ProcessState) {
    if flush_cursor_message(&state.cursor_sink, &mut state.pending_cursor).is_err() {
        set_fatal(&state.fatal, sink_error("cursor sink channel disconnected"));
    }
}

pub(super) fn enqueue_cursor_message(
    sink: &Sender<CursorMessage>,
    pending: &mut Option<CursorMessage>,
    message: CursorMessage,
) -> Result<(), ()> {
    if let Some(previous) = pending.take() {
        match sink.try_send(previous) {
            Ok(()) => {}
            Err(TrySendError::Full(_)) => {
                // The worker is still behind. Keep only the freshest cursor
                // state so the callback remains realtime-safe.
                *pending = Some(message);
                return Ok(());
            }
            Err(TrySendError::Disconnected(_)) => return Err(()),
        }
    }
    match sink.try_send(message) {
        Ok(()) => Ok(()),
        Err(TrySendError::Full(message)) => {
            *pending = Some(message);
            Ok(())
        }
        Err(TrySendError::Disconnected(_)) => Err(()),
    }
}

pub(super) fn flush_cursor_message(
    sink: &Sender<CursorMessage>,
    pending: &mut Option<CursorMessage>,
) -> Result<(), ()> {
    let Some(message) = pending.take() else {
        return Ok(());
    };
    sink.send(message).map_err(|_| ())
}

fn invalid_buffer(state: &mut ProcessState, session_ns: u64, message: &str) {
    state.metrics.dropped_frames(1);
    try_discontinuity(
        state,
        ScreenDiscontinuity {
            session_ns,
            lost_frames: 1,
            code: NativeCaptureErrorCode::PipewireBufferInvalid
                .as_str()
                .into(),
            message: message.into(),
        },
    );
}

fn try_discontinuity(state: &mut ProcessState, event: ScreenDiscontinuity) {
    if let Err(TrySendError::Disconnected(_)) =
        state.sink.try_send(SinkMessage::Discontinuity(event))
    {
        set_fatal(&state.fatal, sink_error("screen sink channel disconnected"));
    }
}

fn flush_pending_drops(state: &mut ProcessState, session_ns: u64) {
    if state.pending_drops == 0 {
        return;
    }
    let count = state.pending_drops;
    match state
        .sink
        .try_send(SinkMessage::Discontinuity(backpressure_event(
            count, session_ns,
        ))) {
        Ok(()) => state.pending_drops = 0,
        Err(TrySendError::Full(_)) => {}
        Err(TrySendError::Disconnected(_)) => {
            set_fatal(&state.fatal, sink_error("screen sink channel disconnected"));
        }
    }
}

pub(super) fn backpressure_event(lost_frames: u64, session_ns: u64) -> ScreenDiscontinuity {
    ScreenDiscontinuity {
        session_ns,
        lost_frames,
        code: NativeCaptureErrorCode::ScreenSinkBackpressure
            .as_str()
            .into(),
        message: "the bounded screen sample queue was full".into(),
    }
}
