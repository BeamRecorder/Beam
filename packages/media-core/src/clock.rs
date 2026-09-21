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

    #[must_use]
    pub fn at(&self, instant: Instant) -> Option<u64> {
        instant
            .checked_duration_since(self.epoch)
            .map(|elapsed| u64::try_from(elapsed.as_nanos()).unwrap_or(u64::MAX))
    }
}

impl Default for SessionClock {
    fn default() -> Self {
        Self::start()
    }
}

impl MonotonicClock for SessionClock {
    fn now_ns(&self) -> u64 {
        self.at(Instant::now()).unwrap_or(0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClockError {
    InvalidRate,
    NativeTimeBeforeAnchor,
    NativeTimeRegressed,
    Overflow,
}

impl std::fmt::Display for ClockError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidRate => write!(formatter, "clock rate must be non-zero"),
            Self::NativeTimeBeforeAnchor => {
                write!(formatter, "native timestamp precedes the clock anchor")
            }
            Self::NativeTimeRegressed => write!(formatter, "native timestamp moved backwards"),
            Self::Overflow => write!(formatter, "session timestamp exceeds u64 nanoseconds"),
        }
    }
}

impl std::error::Error for ClockError {}

/// Maps an OS clock or device sample counter into one recording timeline.
#[derive(Debug, Clone)]
pub struct NativeTimestampMapper {
    native_origin: u64,
    session_origin_ns: u64,
    native_rate: u64,
    last_native: Option<u64>,
}

impl NativeTimestampMapper {
    pub fn new(
        native_origin: u64,
        session_origin_ns: u64,
        native_rate: u64,
    ) -> Result<Self, ClockError> {
        if native_rate == 0 {
            return Err(ClockError::InvalidRate);
        }
        Ok(Self {
            native_origin,
            session_origin_ns,
            native_rate,
            last_native: None,
        })
    }

    pub fn map(&mut self, native: u64) -> Result<u64, ClockError> {
        let delta = native
            .checked_sub(self.native_origin)
            .ok_or(ClockError::NativeTimeBeforeAnchor)?;
        if self.last_native.is_some_and(|last| native < last) {
            return Err(ClockError::NativeTimeRegressed);
        }
        let elapsed_ns = u128::from(delta)
            .checked_mul(1_000_000_000)
            .ok_or(ClockError::Overflow)?
            / u128::from(self.native_rate);
        let elapsed_ns = u64::try_from(elapsed_ns).map_err(|_| ClockError::Overflow)?;
        let session_ns = self
            .session_origin_ns
            .checked_add(elapsed_ns)
            .ok_or(ClockError::Overflow)?;
        self.last_native = Some(native);
        Ok(session_ns)
    }
}

/// Keeps packet positions exact even when callbacks arrive with jitter.
#[derive(Debug, Clone)]
pub struct AudioSampleClock {
    start_ns: u64,
    sample_rate: u32,
    frames: u64,
}

impl AudioSampleClock {
    pub fn new(start_ns: u64, sample_rate: u32) -> Result<Self, ClockError> {
        if sample_rate == 0 {
            return Err(ClockError::InvalidRate);
        }
        Ok(Self {
            start_ns,
            sample_rate,
            frames: 0,
        })
    }

    pub fn advance(&mut self, frames: u64) -> Result<(u64, u64), ClockError> {
        let next = self
            .frames
            .checked_add(frames)
            .ok_or(ClockError::Overflow)?;
        let first_ns = self.timestamp(self.frames)?;
        let next_ns = self.timestamp(next)?;
        self.frames = next;
        Ok((first_ns, next_ns))
    }

    fn timestamp(&self, frames: u64) -> Result<u64, ClockError> {
        let elapsed = u128::from(frames) * 1_000_000_000 / u128::from(self.sample_rate);
        let elapsed = u64::try_from(elapsed).map_err(|_| ClockError::Overflow)?;
        self.start_ns
            .checked_add(elapsed)
            .ok_or(ClockError::Overflow)
    }
}
