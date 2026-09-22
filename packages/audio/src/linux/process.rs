use std::{
    cell::RefCell,
    rc::Rc,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use beam_media_core::{AudioPacket, AudioSampleClock, MonotonicClock, SessionClock, StartGate};
use crossbeam_channel::{Sender, TrySendError};
use pipewire::{self as pw, spa};
use spa::buffer::meta::{MetaHeader, MetaHeaderFlags};

use super::format::NegotiatedFormat;
use crate::{AudioEvent, TimedAudioPacket};

pub(super) struct ProcessState {
    pub(super) format: Option<NegotiatedFormat>,
    pub(super) clock: SessionClock,
    pub(super) gate: Arc<StartGate>,
    pub(super) sample_clock: Option<AudioSampleClock>,
    pub(super) next_sample: u64,
    pub(super) active: bool,
    pub(super) packet_tx: Sender<TimedAudioPacket>,
    pub(super) event_tx: Sender<AudioEvent>,
    pub(super) terminal_tx: Sender<AudioEvent>,
    pub(super) queued_bytes: Arc<AtomicUsize>,
    pub(super) byte_limit: usize,
    pub(super) last_native_timestamp_ns: Option<u64>,
    pub(super) native_timestamps_invalidated: bool,
}

pub(super) struct AudioChunk<'a> {
    pub(super) offset: u32,
    pub(super) size: u32,
    pub(super) memory: Option<&'a [u8]>,
}

impl ProcessState {
    fn native_timestamp(&mut self, pts: i64, flags: MetaHeaderFlags) -> Option<u64> {
        if self.native_timestamps_invalidated {
            return None;
        }
        if flags.intersects(MetaHeaderFlags::DISCONT | MetaHeaderFlags::CORRUPTED)
            && self.next_sample > 0
        {
            self.native_timestamps_invalidated = true;
            return None;
        }
        let timestamp = usable_header_pts(pts, flags)?;
        if self
            .last_native_timestamp_ns
            .is_some_and(|previous| timestamp < previous)
        {
            self.native_timestamps_invalidated = true;
            return None;
        }
        self.last_native_timestamp_ns = Some(timestamp);
        Some(timestamp)
    }
}

pub(super) fn process_audio(stream: &pw::stream::Stream, state: &Rc<RefCell<ProcessState>>) {
    let mut state = state.borrow_mut();
    let Some(mut buffer) = stream.dequeue_buffer() else {
        return;
    };
    if !state.active
        || state.format.is_none()
        || state.gate.session_ns(state.clock.now_ns()).is_none()
    {
        return;
    }
    let header = buffer
        .find_meta::<MetaHeader>()
        .map(|header| (header.pts(), header.flags()));
    let Some(data) = buffer.datas_mut().first_mut() else {
        process_audio_buffer(&mut state, header, None);
        return;
    };
    let chunk = data.chunk();
    let offset = chunk.offset();
    let size = chunk.size();
    let memory = data.data();
    process_audio_buffer(
        &mut state,
        header,
        Some(AudioChunk {
            offset,
            size,
            memory: memory.as_deref(),
        }),
    );
}

pub(super) fn process_audio_buffer(
    state: &mut ProcessState,
    header: Option<(i64, MetaHeaderFlags)>,
    chunk: Option<AudioChunk<'_>>,
) {
    if !state.active {
        return;
    }
    let Some(format) = state.format else { return };
    if state.gate.session_ns(state.clock.now_ns()).is_none() {
        return;
    }
    let was_invalidated = state.native_timestamps_invalidated;
    let native_capture_ns = header.and_then(|(pts, flags)| state.native_timestamp(pts, flags));
    if !was_invalidated && state.native_timestamps_invalidated {
        let _ = state.event_tx.try_send(AudioEvent::ClockDiscontinuity {
            first_sample: state.next_sample,
        });
    }
    let Some(chunk) = chunk else {
        return;
    };
    let (frames, bytes) =
        match validated_audio_chunk(chunk.memory, chunk.offset, chunk.size, format.channels) {
            Ok(Some(chunk)) => chunk,
            Ok(None) => return,
            Err(error) => {
                let _ = state
                    .terminal_tx
                    .try_send(AudioEvent::Failed(error.to_string()));
                return;
            }
        };
    process_bytes(state, format, frames, bytes, native_capture_ns);
}

fn validated_audio_chunk(
    memory: Option<&[u8]>,
    offset: u32,
    size: u32,
    channels: u16,
) -> Result<Option<(u32, &[u8])>, crate::AudioError> {
    let Ok(offset) = usize::try_from(offset) else {
        return Ok(None);
    };
    let Ok(size) = usize::try_from(size) else {
        return Ok(None);
    };
    let frame_bytes = usize::from(channels) * 4;
    if size == 0 || frame_bytes == 0 || size % frame_bytes != 0 {
        return Ok(None);
    }
    let Some(end) = offset.checked_add(size) else {
        return Ok(None);
    };
    let Some(bytes) = memory.and_then(|memory| memory.get(offset..end)) else {
        return Err(crate::AudioError::Backend(
            "PipeWire audio buffer is invalid".into(),
        ));
    };
    let Ok(frames) = u32::try_from(size / frame_bytes) else {
        return Ok(None);
    };
    Ok(Some((frames, bytes)))
}

pub(super) fn usable_header_pts(pts: i64, flags: MetaHeaderFlags) -> Option<u64> {
    if flags.intersects(MetaHeaderFlags::DISCONT | MetaHeaderFlags::CORRUPTED) {
        return None;
    }
    u64::try_from(pts).ok()
}

pub(super) fn process_bytes(
    state: &mut ProcessState,
    format: NegotiatedFormat,
    frames: u32,
    bytes: &[u8],
    native_capture_ns: Option<u64>,
) {
    let size = bytes.len();
    let Some(session_now) = state.gate.session_ns(state.clock.now_ns()) else {
        return;
    };
    if state.sample_clock.is_none() {
        state.sample_clock = AudioSampleClock::new(session_now, format.sample_rate).ok();
    }
    let first_sample = state.next_sample;
    let Some(next_sample) = first_sample.checked_add(u64::from(frames)) else {
        return;
    };
    let Some(sample_clock) = state.sample_clock.as_mut() else {
        return;
    };
    let Ok((start_ns, _)) = sample_clock.advance(u64::from(frames)) else {
        return;
    };
    state.next_sample = next_sample;
    if state
        .queued_bytes
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |current| {
            current
                .checked_add(size)
                .filter(|next| *next <= state.byte_limit)
        })
        .is_err()
    {
        let _ = state.event_tx.try_send(AudioEvent::Dropped {
            first_sample,
            frames,
        });
        return;
    }
    let samples = bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();
    let packet = TimedAudioPacket {
        packet: AudioPacket {
            start_ns,
            sample_rate: format.sample_rate,
            channels: format.channels,
            frames,
            data: samples,
        },
        first_sample,
        native_capture_ns,
    };
    match state.packet_tx.try_send(packet) {
        Ok(()) => {}
        Err(TrySendError::Full(_)) => {
            state.queued_bytes.fetch_sub(size, Ordering::AcqRel);
            let _ = state.event_tx.try_send(AudioEvent::Dropped {
                first_sample,
                frames,
            });
        }
        Err(TrySendError::Disconnected(_)) => {
            state.queued_bytes.fetch_sub(size, Ordering::AcqRel);
            let _ = state.terminal_tx.try_send(AudioEvent::Failed(
                "system audio consumer disconnected".into(),
            ));
        }
    }
}

#[path = "../../test/linux/process.rs"]
mod process_checks;

#[path = "../../test/linux/process_chunk.rs"]
mod chunk_checks;

#[path = "../../test/linux/process_buffer.rs"]
mod buffer_checks;
