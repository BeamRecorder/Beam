use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

const UNRELEASED: u64 = u64::MAX;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateError {
    AlreadyReleased,
    InvalidTimestamp,
}

impl std::fmt::Display for GateError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::AlreadyReleased => write!(formatter, "start gate was already released"),
            Self::InvalidTimestamp => write!(formatter, "start gate timestamp is invalid"),
        }
    }
}

impl std::error::Error for GateError {}

#[derive(Debug)]
pub struct StartGate {
    release_ns: AtomicU64,
    closed: AtomicBool,
}

impl StartGate {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            release_ns: AtomicU64::new(UNRELEASED),
            closed: AtomicBool::new(false),
        }
    }

    pub fn release(&self, clock_ns: u64) -> Result<(), GateError> {
        if self.closed.load(Ordering::Acquire) {
            return Err(GateError::AlreadyReleased);
        }
        if clock_ns == UNRELEASED {
            return Err(GateError::InvalidTimestamp);
        }
        self.release_ns
            .compare_exchange(UNRELEASED, clock_ns, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| GateError::AlreadyReleased)?;
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
        clock_ns.checked_sub(self.release_ns()?)
    }

    pub fn close(&self) {
        self.closed.store(true, Ordering::Release);
    }
}

impl Default for StartGate {
    fn default() -> Self {
        Self::new()
    }
}
