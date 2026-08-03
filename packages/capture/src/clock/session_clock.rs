use std::{
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Instant,
};

pub trait MonotonicClock: Send + Sync {
    fn now_ns(&self) -> u64;
}

#[derive(Debug)]
struct SessionClockInner {
    epoch: Instant,
    last_ns: AtomicU64,
}

#[derive(Debug, Clone)]
pub struct SessionClock {
    inner: Arc<SessionClockInner>,
}

impl SessionClock {
    #[must_use]
    pub fn start() -> Self {
        Self {
            inner: Arc::new(SessionClockInner {
                epoch: Instant::now(),
                last_ns: AtomicU64::new(0),
            }),
        }
    }

    #[must_use]
    pub fn elapsed_ns(&self) -> u64 {
        u64::try_from(self.inner.epoch.elapsed().as_nanos()).unwrap_or(u64::MAX)
    }

    fn publish_monotonic(&self, candidate: u64) -> u64 {
        let mut last = self.inner.last_ns.load(Ordering::Relaxed);
        loop {
            let next = candidate.max(last);
            match self.inner.last_ns.compare_exchange_weak(
                last,
                next,
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => return next,
                Err(observed) => last = observed,
            }
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
        self.publish_monotonic(self.elapsed_ns())
    }
}

#[cfg(test)]
mod tests {
    use std::{sync::Arc, thread};

    use super::{MonotonicClock, SessionClock};

    #[test]
    fn clones_share_one_epoch() {
        let clock = SessionClock::start();
        let clone = clock.clone();
        assert!(clone.now_ns() >= clock.now_ns());
    }

    #[test]
    fn concurrent_reads_never_move_backwards() {
        let clock = Arc::new(SessionClock::start());
        let handles = (0..4)
            .map(|_| {
                let clock = clock.clone();
                thread::spawn(move || {
                    let mut previous = 0;
                    for _ in 0..1_000 {
                        let current = clock.now_ns();
                        assert!(current >= previous);
                        previous = current;
                    }
                })
            })
            .collect::<Vec<_>>();
        for handle in handles {
            assert!(handle.join().is_ok());
        }
    }
}
