use crossbeam_channel::{Receiver, Sender, TrySendError, bounded};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OverflowPolicy {
    DropNewest,
    DropOldest,
    StopSession,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct QueueConfig {
    pub capacity: usize,
    pub overflow: OverflowPolicy,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QueueOutcome {
    Queued,
    DroppedNewest,
    DroppedOldest,
}

pub struct BoundedQueue<T> {
    sender: Sender<T>,
    receiver: Receiver<T>,
    policy: OverflowPolicy,
}
impl<T> BoundedQueue<T> {
    pub fn new(config: QueueConfig) -> Result<Self, crate::CaptureError> {
        if config.capacity == 0 {
            return Err(crate::CaptureError::InvalidConfiguration(
                "queue capacity must be non-zero".into(),
            ));
        }
        let (sender, receiver) = bounded(config.capacity);
        Ok(Self {
            sender,
            receiver,
            policy: config.overflow,
        })
    }
    pub fn try_push(&self, item: T) -> Result<QueueOutcome, crate::CaptureError> {
        match self.sender.try_send(item) {
            Ok(()) => Ok(QueueOutcome::Queued),
            Err(TrySendError::Disconnected(_)) => {
                Err(crate::CaptureError::Backend("queue disconnected".into()))
            }
            Err(TrySendError::Full(item)) => match self.policy {
                OverflowPolicy::DropNewest => Ok(QueueOutcome::DroppedNewest),
                OverflowPolicy::StopSession => Err(crate::CaptureError::Backend(
                    "bounded queue overflow".into(),
                )),
                OverflowPolicy::DropOldest => {
                    let _old = self.receiver.try_recv();
                    self.sender.try_send(item).map_err(|_| {
                        crate::CaptureError::Backend("queue remained full after eviction".into())
                    })?;
                    Ok(QueueOutcome::DroppedOldest)
                }
            },
        }
    }
    #[must_use]
    pub fn receiver(&self) -> Receiver<T> {
        self.receiver.clone()
    }
}
