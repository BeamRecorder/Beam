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
    last_ns: Option<u64>,
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
            last_ns: None,
        })
    }
}

impl TimestampMapper for LinearTimestampMapper {
    type NativeTimestamp = u64;
    fn to_session_ns(&mut self, native: u64) -> Result<u64, CaptureError> {
        if native < self.native_origin {
            return Err(CaptureError::Backend(
                "native timestamp moved before origin".into(),
            ));
        }
        let delta = u128::from(native - self.native_origin).saturating_mul(1_000_000_000)
            / u128::from(self.native_rate);
        let mapped = self
            .session_origin_ns
            .saturating_add(u64::try_from(delta).unwrap_or(u64::MAX));
        if self.last_ns.is_some_and(|last| mapped < last) {
            return Err(CaptureError::Backend(
                "non-monotonic mapped timestamp".into(),
            ));
        }
        self.last_ns = Some(mapped);
        Ok(mapped)
    }
}
