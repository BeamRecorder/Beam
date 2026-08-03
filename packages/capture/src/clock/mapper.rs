use crate::CaptureError;

pub trait TimestampMapper {
    type NativeTimestamp;
    fn to_session_ns(
        &mut self,
        native_timestamp: Self::NativeTimestamp,
    ) -> Result<u64, CaptureError>;
}

#[derive(Debug, Clone)]
pub struct LinearTimestampMapper {
    native_origin: u64,
    session_origin_ns: u64,
    native_rate: u64,
    last_native: Option<u64>,
    last_ns: Option<u64>,
    discontinuities: u64,
}

impl LinearTimestampMapper {
    pub fn new(
        native_origin: u64,
        session_origin_ns: u64,
        native_rate: u64,
    ) -> Result<Self, CaptureError> {
        if native_rate == 0 {
            return Err(CaptureError::InvalidConfiguration(
                "native timestamp rate must be non-zero".into(),
            ));
        }
        Ok(Self {
            native_origin,
            session_origin_ns,
            native_rate,
            last_native: None,
            last_ns: None,
            discontinuities: 0,
        })
    }

    #[must_use]
    pub const fn discontinuities(&self) -> u64 {
        self.discontinuities
    }

    fn reanchor(&mut self, native: u64) {
        self.native_origin = native;
        self.session_origin_ns = self
            .last_ns
            .map_or(self.session_origin_ns, |last| last.saturating_add(1));
        self.discontinuities = self.discontinuities.saturating_add(1);
    }

    fn map_from_anchor(&self, native: u64) -> u64 {
        let delta = u128::from(native.saturating_sub(self.native_origin))
            .saturating_mul(1_000_000_000)
            / u128::from(self.native_rate);
        self.session_origin_ns
            .saturating_add(u64::try_from(delta).unwrap_or(u64::MAX))
    }
}

impl TimestampMapper for LinearTimestampMapper {
    type NativeTimestamp = u64;

    fn to_session_ns(&mut self, native: u64) -> Result<u64, CaptureError> {
        if native < self.native_origin
            || self
                .last_native
                .is_some_and(|last_native| native < last_native)
        {
            self.reanchor(native);
        }
        let mapped = self
            .last_ns
            .map_or_else(|| self.map_from_anchor(native), |last| self.map_from_anchor(native).max(last));
        self.last_native = Some(native);
        self.last_ns = Some(mapped);
        Ok(mapped)
    }
}

#[cfg(test)]
mod tests {
    use super::{LinearTimestampMapper, TimestampMapper};

    #[test]
    fn maps_native_ticks_to_nanoseconds() {
        let mut mapper = LinearTimestampMapper::new(100, 1_000, 10).unwrap_or_else(|_| unreachable!());
        assert_eq!(mapper.to_session_ns(110), Ok(1_000_000_001_000));
    }

    #[test]
    fn reanchors_after_native_clock_reset() {
        let mut mapper = LinearTimestampMapper::new(100, 10, 1_000).unwrap_or_else(|_| unreachable!());
        let first = mapper.to_session_ns(200).unwrap_or_default();
        let reset = mapper.to_session_ns(5).unwrap_or_default();
        assert!(reset > first);
        assert_eq!(mapper.discontinuities(), 1);
    }

    #[test]
    fn duplicate_ticks_are_non_decreasing() {
        let mut mapper = LinearTimestampMapper::new(0, 0, 1).unwrap_or_else(|_| unreachable!());
        let first = mapper.to_session_ns(1).unwrap_or_default();
        let second = mapper.to_session_ns(1).unwrap_or_default();
        assert_eq!(first, second);
    }

    #[test]
    fn rejects_zero_rate() {
        assert!(LinearTimestampMapper::new(0, 0, 0).is_err());
    }
}
