use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

use beam_media_core::{
    LatestFrame, MonotonicClock, NativeTimestampMapper, SessionClock, StartGate, VideoFrame,
};
use crossbeam_channel::{Sender, TrySendError};

use crate::{CameraError, CameraEvent, CameraFormat, CameraFrame};

type CapturedFrame = VideoFrame<CameraFrame>;

pub(super) struct DispatchPorts {
    pub frame_tx: Sender<CapturedFrame>,
    pub event_tx: Sender<CameraEvent>,
    pub latest: Arc<LatestFrame<CapturedFrame>>,
    pub queued_bytes: Arc<AtomicUsize>,
    pub byte_limit: usize,
}

pub(super) struct FrameDispatcher {
    format: CameraFormat,
    clock: SessionClock,
    gate: Arc<StartGate>,
    mapper: Option<NativeTimestampMapper>,
    last_pts: u64,
    ports: DispatchPorts,
}

impl FrameDispatcher {
    pub(super) fn new(
        format: CameraFormat,
        clock: SessionClock,
        gate: Arc<StartGate>,
        ports: DispatchPorts,
    ) -> Self {
        Self {
            format,
            clock,
            gate,
            mapper: None,
            last_pts: 0,
            ports,
        }
    }

    pub(super) fn started(&self) {
        let _ = self.ports.event_tx.try_send(CameraEvent::Started);
    }

    pub(super) fn dispatch(
        &mut self,
        bytes: &[u8],
        sequence: u64,
        bytes_used: u32,
        driver_error: bool,
        native_ns: Option<u64>,
    ) -> Result<(), CameraError> {
        if driver_error {
            self.dropped(sequence);
            return Ok(());
        }
        let Some(session_now) = self.gate.session_ns(self.clock.now_ns()) else {
            return Ok(());
        };
        let captured_ns = if let Some(native) = native_ns {
            if self.mapper.is_none() {
                self.mapper = Some(
                    NativeTimestampMapper::new(native, session_now, 1_000_000_000)
                        .map_err(|error| CameraError::Clock(error.to_string()))?,
                );
            }
            let Some(active_mapper) = self.mapper.as_mut() else {
                return Ok(());
            };
            match active_mapper.map(native) {
                Ok(value) => value,
                Err(_) => {
                    let _ = self
                        .ports
                        .event_tx
                        .try_send(CameraEvent::ClockDiscontinuity { sequence });
                    *active_mapper = NativeTimestampMapper::new(native, session_now, 1_000_000_000)
                        .map_err(|error| CameraError::Clock(error.to_string()))?;
                    session_now
                }
            }
        } else {
            session_now
        };
        let captured_ns = captured_ns.max(self.last_pts.saturating_add(1));
        self.last_pts = captured_ns;
        let length = usize::try_from(bytes_used)
            .unwrap_or(bytes.len())
            .min(bytes.len());
        let frame = VideoFrame {
            captured_ns,
            width: self.format.width,
            height: self.format.height,
            data: CameraFrame {
                format: self.format,
                native_timestamp_ns: native_ns,
                sequence,
                data: Arc::from(&bytes[..length]),
            },
        };
        self.ports.latest.publish(frame.clone());
        let size = frame.data.data.len();
        if self
            .ports
            .queued_bytes
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |current| {
                current
                    .checked_add(size)
                    .filter(|next| *next <= self.ports.byte_limit)
            })
            .is_err()
        {
            self.dropped(sequence);
            return Ok(());
        }
        match self.ports.frame_tx.try_send(frame) {
            Ok(()) => Ok(()),
            Err(TrySendError::Full(frame)) => {
                self.ports.queued_bytes.fetch_sub(size, Ordering::AcqRel);
                self.dropped(frame.data.sequence);
                Ok(())
            }
            Err(TrySendError::Disconnected(_)) => {
                self.ports.queued_bytes.fetch_sub(size, Ordering::AcqRel);
                Err(CameraError::Backend("camera consumer disconnected".into()))
            }
        }
    }

    fn dropped(&self, sequence: u64) {
        let _ = self
            .ports
            .event_tx
            .try_send(CameraEvent::Dropped { sequence });
    }
}

#[path = "../../test/linux/dispatch.rs"]
mod dispatch_checks;
