use std::time::Instant;

pub trait MonotonicClock: Send + Sync {
    fn now_ns(&self) -> u64;
}

#[derive(Debug, Clone)]
pub struct SessionClock {
    epoch: Instant,
}

impl SessionClock {
    #[must_use]
    pub fn start() -> Self {
        Self {
            epoch: Instant::now(),
        }
    }
}

impl Default for SessionClock {
    fn default() -> Self {
        Self::start()
    }
}

impl MonotonicClock for SessionClock {
    fn now_ns(&self) -> u64 {
        u64::try_from(self.epoch.elapsed().as_nanos()).unwrap_or(u64::MAX)
    }
}
