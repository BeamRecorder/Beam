use std::{
    cell::RefCell,
    rc::Rc,
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
        VideoFormat,
    },
    session::StartGate,
};

use super::{
    BufferLayout, CursorState, NegotiatedFormat, TimestampMapper, copy_frame, has_fatal,
    map_cursor_metadata, metadata, set_fatal, sink_error, video_format,
};

pub(super) enum SinkMessage {
    Format(VideoFormat),
    Sample(OwnedScreenSample),
    Discontinuity(ScreenDiscontinuity),
    Finish,
}

pub(super) struct ProcessState {
    pub negotiated: Option<NegotiatedFormat>,
    pub last_announced: Option<VideoFormat>,
    pub cursor: CursorState,
    pub timestamp: TimestampMapper,
    pub start_gate: Arc<StartGate>,
    pub active: bool,
    pub clock: Instant,
    pub sink: Sender<SinkMessage>,
    pub metrics: Arc<ScreenCaptureMetrics>,
    pub fatal: Arc<Mutex<Option<CaptureError>>>,
    pub pending_drops: u64,
}

pub(super) fn process_buffer(stream: &pw::stream::Stream, state: &Rc<RefCell<ProcessState>>) {
    let mut state = state.borrow_mut();
    if !state.active || !state.start_gate.is_released() || has_fatal(&state.fatal) {
        return;
    }
    let Some(format) = state.negotiated else {
        set_fatal(
            &state.fatal,
            super::format_error("received a buffer before format negotiation"),
        );
        return;
    };
    let Some(mut buffer) = stream.dequeue_buffer() else {
        return;
    };
    let header = metadata::header(&buffer);
    let cursor = metadata::cursor(&buffer);
    let crop = metadata::crop(&buffer);
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
    let chunk = data.chunk();
    if chunk.flags().contains(ChunkFlags::CORRUPTED) {
        invalid_buffer(
            &mut state,
            timestamp.session_ns,
            "PipeWire marked the video chunk corrupted",
        );
        return;
    }
    let layout = BufferLayout {
        offset: usize::try_from(chunk.offset()).unwrap_or(usize::MAX),
        size: usize::try_from(chunk.size()).unwrap_or(usize::MAX),
        stride: chunk.stride(),
        crop,
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
    let frame = match copy_frame(memory, format, layout) {
        Ok(frame) => frame,
        Err(error) => {
            invalid_buffer(&mut state, timestamp.session_ns, &error.to_string());
            return;
        }
    };
    let cursor = map_cursor_metadata(cursor, format.width, format.height, crop, transform);
    let sample_cursor = state.cursor.resolve(cursor, frame.width, frame.height);
    let announced = video_format(&frame);
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
