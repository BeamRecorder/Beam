use crate::model::{MediaPacket, TrackId};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AudioFormat {
    pub sample_rate: u32,
    pub channels: u16,
}

impl AudioFormat {
    pub fn duration_ns(self, sample_count: usize) -> Option<u64> {
        let frames = sample_count.checked_div(usize::from(self.channels))?;
        u64::try_from(frames)
            .ok()?
            .checked_mul(1_000_000_000)?
            .checked_div(u64::from(self.sample_rate))
    }
}

pub fn audio_packet(
    track_id: TrackId,
    pts_ns: u64,
    format: AudioFormat,
    samples: Vec<f32>,
) -> Result<MediaPacket, crate::CaptureError> {
    let duration_ns = format
        .duration_ns(samples.len())
        .ok_or_else(|| crate::CaptureError::InvalidConfiguration("invalid audio format".into()))?;
    let packet = MediaPacket {
        track_id,
        pts_ns,
        duration_ns,
        payload: crate::model::PacketPayload::Audio {
            samples,
            sample_rate: format.sample_rate,
            channels: format.channels,
        },
    };
    packet.validate()?;
    Ok(packet)
}
