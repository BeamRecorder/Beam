use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
use std::time::Duration;

use crossbeam_channel::{Receiver, RecvTimeoutError, TryRecvError};

use crate::{AudioError, TimedAudioPacket};

/// Shared consumer-side queue contract for CPAL and PipeWire captures.
pub(crate) struct AudioPacketQueue {
    packets: Receiver<TimedAudioPacket>,
    queued_bytes: Arc<AtomicUsize>,
    disconnected_message: &'static str,
}

impl AudioPacketQueue {
    pub(crate) fn new(
        packets: Receiver<TimedAudioPacket>,
        queued_bytes: Arc<AtomicUsize>,
        disconnected_message: &'static str,
    ) -> Self {
        Self {
            packets,
            queued_bytes,
            disconnected_message,
        }
    }

    pub(crate) fn depth(&self) -> (usize, usize) {
        (
            self.packets.len(),
            self.queued_bytes.load(Ordering::Acquire),
        )
    }

    pub(crate) fn try_packet(&self) -> Result<Option<TimedAudioPacket>, AudioError> {
        match self.packets.try_recv() {
            Ok(packet) => Ok(Some(self.received(packet))),
            Err(TryRecvError::Empty) => Ok(None),
            Err(TryRecvError::Disconnected) => Err(self.disconnected()),
        }
    }

    pub(crate) fn recv_packet_timeout(
        &self,
        timeout: Duration,
    ) -> Result<Option<TimedAudioPacket>, AudioError> {
        match self.packets.recv_timeout(timeout) {
            Ok(packet) => Ok(Some(self.received(packet))),
            Err(RecvTimeoutError::Timeout) => Ok(None),
            Err(RecvTimeoutError::Disconnected) => Err(self.disconnected()),
        }
    }

    fn received(&self, packet: TimedAudioPacket) -> TimedAudioPacket {
        self.queued_bytes.fetch_sub(
            packet.packet.data.len() * size_of::<f32>(),
            Ordering::AcqRel,
        );
        packet
    }

    fn disconnected(&self) -> AudioError {
        AudioError::Backend(self.disconnected_message.into())
    }
}

#[path = "../test/queue.rs"]
mod queue_checks;
