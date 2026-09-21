use crate::CaptureError;
use beam_media_core::{ClockError, NativeTimestampMapper};

pub trait TimestampMapper {
    type NativeTimestamp;
    fn to_session_ns(
        &mut self,
        native_timestamp: Self::NativeTimestamp,
    ) -> Result<u64, CaptureError>;
}

#[derive(Debug, Clone)]
pub struct LinearTimestampMapper {
    inner: NativeTimestampMapper,
}

impl LinearTimestampMapper {
    pub fn new(
        native_origin: u64,
        session_origin_ns: u64,
        native_rate: u64,
    ) -> Result<Self, CaptureError> {
        Ok(Self {
            inner: NativeTimestampMapper::new(native_origin, session_origin_ns, native_rate)
                .map_err(map_clock_error)?,
        })
    }
}

impl TimestampMapper for LinearTimestampMapper {
    type NativeTimestamp = u64;
    fn to_session_ns(&mut self, native: u64) -> Result<u64, CaptureError> {
        self.inner.map(native).map_err(map_clock_error)
    }
}

fn map_clock_error(error: ClockError) -> CaptureError {
    match error {
        ClockError::InvalidRate => CaptureError::InvalidConfiguration(error.to_string()),
        _ => CaptureError::Backend(error.to_string()),
    }
}
