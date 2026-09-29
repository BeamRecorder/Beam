use crate::EncodeError;

/// The actual recording codec and native encoder, exposed to session metadata.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VideoEncoding {
    pub factory: &'static str,
    pub codec: &'static str,
    pub pixel_format: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VideoConfig {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
}

impl VideoConfig {
    pub fn validate(self) -> Result<(), EncodeError> {
        if self.width == 0 || self.height == 0 || self.fps == 0 {
            return Err(EncodeError::InvalidFormat(
                "video width, height and fps must be non-zero".into(),
            ));
        }
        if self.width > i32::MAX as u32
            || self.height > i32::MAX as u32
            || self.fps > i32::MAX as u32
        {
            return Err(EncodeError::InvalidFormat(
                "video format exceeds GStreamer caps limits".into(),
            ));
        }
        let _ = self.rgba_bytes()?;
        Ok(())
    }

    pub fn rgba_bytes(self) -> Result<usize, EncodeError> {
        let pixels = u64::from(self.width) * u64::from(self.height);
        pixels
            .checked_mul(4)
            .and_then(|bytes| usize::try_from(bytes).ok())
            .ok_or_else(|| EncodeError::InvalidFormat("video frame dimensions overflow".into()))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AudioConfig {
    pub sample_rate: u32,
    pub channels: u16,
}

impl AudioConfig {
    pub fn validate(self) -> Result<(), EncodeError> {
        if self.sample_rate == 0 || self.channels == 0 {
            return Err(EncodeError::InvalidFormat(
                "audio sample rate and channels must be non-zero".into(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct QueueLimits {
    pub packets: usize,
    pub bytes: usize,
}

impl QueueLimits {
    pub fn validate(self) -> Result<(), EncodeError> {
        if self.packets == 0 || self.bytes == 0 {
            return Err(EncodeError::InvalidFormat(
                "queue packet and byte limits must be non-zero".into(),
            ));
        }
        Ok(())
    }
}
