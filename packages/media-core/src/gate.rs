use std::sync::{
    Condvar, Mutex,
    atomic::{AtomicBool, AtomicU64, Ordering},
};

const UNRELEASED: u64 = u64::MAX;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateError {
    AlreadyReleased,
    InvalidTimestamp,
    InvalidTransition,
}

impl std::fmt::Display for GateError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::AlreadyReleased => write!(formatter, "start gate was already released"),
            Self::InvalidTimestamp => write!(formatter, "start gate timestamp is invalid"),
            Self::InvalidTransition => write!(formatter, "invalid gate pause/resume transition"),
        }
    }
}

impl std::error::Error for GateError {}

#[derive(Debug)]
pub struct StartGate {
    release_ns: AtomicU64,
    closed: AtomicBool,
    paused_at: AtomicU64,
    paused_total: AtomicU64,
    epoch: AtomicU64,
    changed: Condvar,
    wake: Mutex<()>,
}

impl StartGate {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            release_ns: AtomicU64::new(UNRELEASED),
            closed: AtomicBool::new(false),
            paused_at: AtomicU64::new(UNRELEASED),
            paused_total: AtomicU64::new(0),
            epoch: AtomicU64::new(0),
            changed: Condvar::new(),
            wake: Mutex::new(()),
        }
    }

    pub fn release(&self, clock_ns: u64) -> Result<(), GateError> {
        let _wake = self
            .wake
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if self.closed.load(Ordering::Acquire) {
            return Err(GateError::AlreadyReleased);
        }
        if clock_ns == UNRELEASED {
            return Err(GateError::InvalidTimestamp);
        }
        self.release_ns
            .compare_exchange(UNRELEASED, clock_ns, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| GateError::AlreadyReleased)?;
        self.changed.notify_all();
        Ok(())
    }

    #[must_use]
    pub fn release_ns(&self) -> Option<u64> {
        let value = self.release_ns.load(Ordering::Acquire);
        (value != UNRELEASED).then_some(value)
    }

    #[must_use]
    pub fn session_ns(&self, clock_ns: u64) -> Option<u64> {
        if self.closed.load(Ordering::Acquire) {
            return None;
        }
        if self.paused_at.load(Ordering::Acquire) != UNRELEASED {
            return None;
        }
        self.elapsed_ns(clock_ns)
    }

    pub fn elapsed_ns(&self, clock_ns: u64) -> Option<u64> {
        let end = clock_ns.min(self.paused_at.load(Ordering::Acquire));
        end.checked_sub(self.release_ns()?)?
            .checked_sub(self.paused_total.load(Ordering::Acquire))
    }

    pub fn epoch(&self) -> u64 {
        self.epoch.load(Ordering::Acquire)
    }

    pub fn pause(&self, clock_ns: u64) -> Result<u64, GateError> {
        let _wake = self
            .wake
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if self.closed.load(Ordering::Acquire)
            || self.paused_at.load(Ordering::Acquire) != UNRELEASED
        {
            return Err(GateError::InvalidTransition);
        }
        let elapsed = self
            .elapsed_ns(clock_ns)
            .ok_or(GateError::InvalidTimestamp)?;
        self.paused_at.store(clock_ns, Ordering::Release);
        Ok(elapsed)
    }

    pub fn resume(&self, clock_ns: u64) -> Result<(), GateError> {
        let _wake = self
            .wake
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let paused = self.paused_at.load(Ordering::Acquire);
        if self.closed.load(Ordering::Acquire) || paused == UNRELEASED {
            return Err(GateError::InvalidTransition);
        }
        let delta = clock_ns
            .checked_sub(paused)
            .ok_or(GateError::InvalidTimestamp)?;
        let total = self
            .paused_total
            .load(Ordering::Acquire)
            .checked_add(delta)
            .ok_or(GateError::InvalidTimestamp)?;
        self.paused_total.store(total, Ordering::Release);
        self.epoch.fetch_add(1, Ordering::AcqRel);
        self.paused_at.store(UNRELEASED, Ordering::Release);
        Ok(())
    }

    pub fn close(&self) {
        let _wake = self
            .wake
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        self.closed.store(true, Ordering::Release);
        self.changed.notify_all();
    }

    pub fn cancel(&self) {
        self.close();
    }

    pub fn is_released(&self) -> bool {
        !self.closed.load(Ordering::Acquire) && self.release_ns().is_some()
    }

    /// Native workers may wait for the shared origin without busy polling.
    pub fn wait(&self) -> Result<u64, GateError> {
        let mut wake = self
            .wake
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        loop {
            if self.closed.load(Ordering::Acquire) {
                return Err(GateError::AlreadyReleased);
            }
            if let Some(origin) = self.release_ns() {
                return Ok(origin);
            }
            wake = self
                .changed
                .wait(wake)
                .unwrap_or_else(std::sync::PoisonError::into_inner);
        }
    }
}

impl Default for StartGate {
    fn default() -> Self {
        Self::new()
    }
}
