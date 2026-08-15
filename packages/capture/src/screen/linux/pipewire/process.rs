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
    screen::{
        CursorSampleState, OwnedScreenSample, ScreenCaptureMetrics, ScreenDiscontinuity,
        ScreenSegment, VideoFormat,
    },
    session::StartGate,
};

use super::{
    BufferLayout, CropRect, CursorState, NegotiatedFormat, TimestampMapper, VideoTransform,
    copy_frame, expand_crop_to_content, has_fatal, map_cursor_metadata, metadata, set_fatal,
    sink_error, video_format,
};

pub(super) enum SinkMessage {
    BeginSegment(ScreenSegment, mpsc::SyncSender<Result<(), CaptureError>>),
    Format(VideoFormat),
    Sample(OwnedScreenSample),
    Cursor(u64, CursorSampleState),
    Discontinuity(ScreenDiscontinuity),
    EndSegment(mpsc::SyncSender<Result<(), CaptureError>>),
    Finish,
}

pub(super) struct ProcessState {
    pub negotiated: Option<NegotiatedFormat>,
    pub last_announced: Option<VideoFormat>,
    pub cursor: CursorState,
    pub timestamp: TimestampMapper,
    pub start_gate: Arc<StartGate>,
    pub active: bool,
    pub stopping: bool,
    pub clock: Instant,
    pub sink: Sender<SinkMessage>,
    pub metrics: Arc<ScreenCaptureMetrics>,
    pub fatal: Arc<Mutex<Option<CaptureError>>>,
    pub pending_drops: u64,
    pub last_frame_geometry: Option<FrameGeometry>,
    pub repair_window_crop: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct FrameGeometry {
    frame_crop: Option<CropRect>,
    cursor_crop: Option<CropRect>,
    transform: VideoTransform,
    width: u32,
    height: u32,
}

impl FrameGeometry {
    pub(super) fn from_frame(
        format: NegotiatedFormat,
        frame_crop: Option<CropRect>,
        cursor_crop: Option<CropRect>,
        transform: VideoTransform,
        frame: &crate::screen::OwnedVideoFrame,
    ) -> Self {
        debug_assert_eq!(
            super::output_dimensions(format, frame_crop, transform).ok(),
            Some((frame.width, frame.height))
        );
        Self {
            frame_crop,
            cursor_crop,
            transform,
            width: frame.width,
            height: frame.height,
        }
    }

    pub(super) fn map_cursor(
        self,
        cursor: Option<super::CursorMetadata>,
        format: NegotiatedFormat,
    ) -> Option<super::CursorMetadata> {
        let mut cursor = map_cursor_metadata(
            cursor,
            format.width,
            format.height,
            self.cursor_crop,
            self.transform,
        )?;
        let (cursor_width, cursor_height) =
            super::output_dimensions(format, self.cursor_crop, self.transform).ok()?;
        cursor.x = scale_coordinate(cursor.x, cursor_width, self.width);
        cursor.y = scale_coordinate(cursor.y, cursor_height, self.height);
        Some(cursor)
    }
}

fn scale_coordinate(value: i32, source: u32, destination: u32) -> i32 {
    if source == destination || source == 0 {
        return value;
    }
    let scaled = i64::from(value)
        .saturating_mul(i64::from(destination))
        .checked_div(i64::from(source))
        .unwrap_or_default();
    i32::try_from(scaled).unwrap_or(if scaled < 0 { i32::MIN } else { i32::MAX })
}

pub(super) fn repaired_window_crop(
    reported: Option<CropRect>,
    content: Option<CropRect>,
) -> Option<CropRect> {
    let (Some(reported), Some(content)) = (reported, content) else {
        return reported;
    };
    let width_scale = f64::from(content.width) / f64::from(reported.width.max(1));
    let height_scale = f64::from(content.height) / f64::from(reported.height.max(1));
    let uniform_scale = (width_scale - height_scale).abs() <= 0.05;
    let materially_larger = width_scale >= 1.1 && height_scale >= 1.1;
    if uniform_scale && materially_larger {
        Some(content)
    } else {
        Some(reported)
    }
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
    let cursor = metadata::cursor(&buffer, state.cursor.classifier_mut());
    let has_cursor_metadata = cursor.as_ref().is_some_and(|cursor| cursor.id != 0);
    let reported_crop = metadata::crop(&buffer);
    let transform = metadata::transform(&buffer);
    let arrival_ns = u64::try_from(state.clock.elapsed().as_nanos()).unwrap_or(u64::MAX);
    let timestamp = match state.timestamp.map(header, arrival_ns) {
        Ok(timestamp) => timestamp,
        Err(event) => {
            state.metrics.dropped_frames(1);
            try_discontinuity(&mut state, event);
            return;
        }
    };
    let datas = buffer.datas_mut();
    if datas.len() != 1 {
        invalid_buffer(
            &mut state,
            timestamp.session_ns,
            "expected exactly one video plane",
        );
        return;
    }
    let data = &mut datas[0];
    let chunk = data.chunk();
    // Mutter deliberately queues cursor-only updates with an empty video chunk
    // flagged CORRUPTED. The MetaCursor payload remains valid and must reach the
    // sidecar without duplicating the previous video frame.
    if chunk.flags().contains(ChunkFlags::CORRUPTED) || chunk.size() == 0 {
        let Some(geometry) = state.last_frame_geometry else {
            return;
        };
        let cursor = geometry.map_cursor(cursor, format);
        let sample_cursor = state
            .cursor
            .resolve(cursor, geometry.width, geometry.height);
        if has_cursor_metadata && matches!(sample_cursor, CursorSampleState::Known { .. }) {
            try_cursor_sample(&mut state, timestamp.session_ns, sample_cursor);
        } else {
            invalid_buffer(
                &mut state,
                timestamp.session_ns,
                "PipeWire delivered an empty or corrupted video chunk without cursor metadata",
            );
        }
        return;
    }
    let memory_type = data.type_();
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
    let layout = BufferLayout {
        offset: usize::try_from(chunk.offset()).unwrap_or(usize::MAX),
        size: usize::try_from(chunk.size()).unwrap_or(usize::MAX),
        stride: chunk.stride(),
        crop: reported_crop,
        transform,
    };
    let Some(memory) = data.data() else {
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
                invalid_buffer(&mut state, timestamp.session_ns, &error.to_string());
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
    let frame = match copy_frame(memory, format, layout) {
        Ok(frame) => frame,
        Err(error) => {
            invalid_buffer(&mut state, timestamp.session_ns, &error.to_string());
            return;
        }
    };
    let geometry =
        FrameGeometry::from_frame(format, frame_crop, cursor_crop, frame_transform, &frame);
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
    flush_pending_drops(&mut state, timestamp.session_ns);
    let has_cursor = matches!(sample_cursor, CursorSampleState::Known { .. });
    let native_pts = timestamp.native_pts_ns;
    let sample = OwnedScreenSample {
        frame,
        timestamp,
        sequence: header.sequence,
        cursor: sample_cursor,
    };
    match state.sink.try_send(SinkMessage::Sample(sample)) {
        Ok(()) => state.metrics.received_frame(native_pts, has_cursor),
        Err(TrySendError::Full(_)) => {
            state.metrics.dropped_frames(1);
            state.pending_drops = state.pending_drops.saturating_add(1);
        }
        Err(TrySendError::Disconnected(_)) => {
            set_fatal(&state.fatal, sink_error("screen sink channel disconnected"));
        }
    }
}

fn try_cursor_sample(state: &mut ProcessState, session_ns: u64, cursor: CursorSampleState) {
    match state.sink.try_send(SinkMessage::Cursor(session_ns, cursor)) {
        Ok(()) => {}
        Err(TrySendError::Full(_)) => {
            state.metrics.dropped_frames(1);
            state.pending_drops = state.pending_drops.saturating_add(1);
        }
        Err(TrySendError::Disconnected(_)) => {
            set_fatal(&state.fatal, sink_error("screen sink channel disconnected"));
        }
    }
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
