use serde::{Deserialize, Serialize};

use super::TrackId;

/// A packet already placed on the session timeline before it reaches an
/// encoder or a storage writer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "mediaType", rename_all = "kebab-case")]
pub enum PacketPayload {
    Video {
        data: Vec<u8>,
        width: u32,
        height: u32,
        pixel_format: String,
    },
    Audio {
        samples: Vec<f32>,
        sample_rate: u32,
        channels: u16,
    },
    Events {
        data: Vec<u8>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaPacket {
    pub track_id: TrackId,
    pub pts_ns: u64,
    pub duration_ns: u64,
    pub payload: PacketPayload,
}

impl MediaPacket {
    pub fn validate(&self) -> Result<(), crate::CaptureError> {
        if self.duration_ns == 0 {
            return Err(crate::CaptureError::InvalidConfiguration(
                "media packet duration must be non-zero".into(),
            ));
        }
        match &self.payload {
            PacketPayload::Video {
                data,
                width,
                height,
                ..
            } => {
                if data.is_empty() || *width == 0 || *height == 0 {
                    return Err(crate::CaptureError::InvalidConfiguration(
                        "video packets must contain non-empty dimensions and data".into(),
                    ));
                }
            }
            PacketPayload::Audio {
                samples,
                sample_rate,
                channels,
            } => {
                if samples.is_empty() || *sample_rate == 0 || *channels == 0 {
                    return Err(crate::CaptureError::InvalidConfiguration(
                        "audio packets must contain samples and a valid format".into(),
                    ));
                }
                if !samples.len().is_multiple_of(usize::from(*channels)) {
                    return Err(crate::CaptureError::InvalidConfiguration(
                        "audio packet samples must contain complete frames".into(),
                    ));
                }
            }
            PacketPayload::Events { data } if data.is_empty() => {
                return Err(crate::CaptureError::InvalidConfiguration(
                    "event packets must contain data".into(),
                ));
            }
            PacketPayload::Events { .. } => {}
        }
        Ok(())
    }
}
