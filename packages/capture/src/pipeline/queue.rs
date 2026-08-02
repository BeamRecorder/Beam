use std::sync::atomic::{AtomicU64, Ordering};

use crossbeam_channel::{Receiver, Sender, TryRecvError, TrySendError, bounded};

use crate::{CaptureError, model::MediaPacket};

#[derive(Debug, Default)]
pub struct QueueStats {
    accepted: AtomicU64,
    dropped: AtomicU64,
}

impl QueueStats {
    #[must_use]
    pub fn accepted(&self) -> u64 {
        self.accepted.load(Ordering::Relaxed)
    }

    #[must_use]
    pub fn dropped(&self) -> u64 {
        self.dropped.load(Ordering::Relaxed)
    }
}

pub struct BoundedPacketQueue {
    sender: Sender<MediaPacket>,
    receiver: Receiver<MediaPacket>,
    stats: QueueStats,
}

impl BoundedPacketQueue {
    pub fn new(capacity: usize) -> Result<Self, CaptureError> {
        if capacity == 0 {
            return Err(CaptureError::InvalidConfiguration(
                "packet queue capacity must be non-zero".into(),
            ));
        }
        let (sender, receiver) = bounded(capacity);
        Ok(Self {
            sender,
            receiver,
            stats: QueueStats::default(),
        })
    }

    pub fn push(&self, packet: MediaPacket) -> Result<(), MediaPacket> {
        match self.sender.try_send(packet) {
            Ok(()) => {
                self.stats.accepted.fetch_add(1, Ordering::Relaxed);
                Ok(())
            }
            Err(TrySendError::Full(packet)) => {
                self.stats.dropped.fetch_add(1, Ordering::Relaxed);
                Err(packet)
            }
            Err(TrySendError::Disconnected(packet)) => Err(packet),
        }
    }

    pub fn pop(&self) -> Option<MediaPacket> {
        self.receiver.try_recv().ok()
    }

    pub fn drain_until(&self, end_ns: u64) -> Vec<MediaPacket> {
        let mut packets = Vec::new();
        loop {
            match self.receiver.try_recv() {
                Ok(packet) if packet.pts_ns <= end_ns => packets.push(packet),
                Ok(_) => {}
                Err(TryRecvError::Empty | TryRecvError::Disconnected) => break,
            }
        }
        packets
    }

    #[must_use]
    pub const fn stats(&self) -> &QueueStats {
        &self.stats
    }
}
