use crate::model::{MediaPacket, PacketPayload, TrackId};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VideoFormat {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
}

impl VideoFormat {
    pub fn frame_duration_ns(self) -> Option<u64> {
        1_000_000_000u64.checked_div(u64::from(self.fps))
    }
}

pub fn video_packet(
    track_id: TrackId,
    pts_ns: u64,
    format: VideoFormat,
    data: Vec<u8>,
) -> Result<MediaPacket, crate::CaptureError> {
    let packet = MediaPacket {
        track_id,
        pts_ns,
        duration_ns: format
            .frame_duration_ns()
            .ok_or_else(|| crate::CaptureError::InvalidConfiguration("invalid video fps".into()))?,
        payload: PacketPayload::Video {
            data,
            width: format.width,
            height: format.height,
            pixel_format: "bgra8".into(),
        },
    };
    packet.validate()?;
    Ok(packet)
}
