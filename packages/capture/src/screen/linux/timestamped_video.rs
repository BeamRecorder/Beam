//! Minimal streaming Matroska framing for uncompressed BGRA and capture PTS.
//! Pixels stay borrowed; only the small header preceding each frame is allocated.
//! https://www.matroska.org/technical/codec_specs.html#v_uncompressed

use crate::CaptureError;

const MAX_ELEMENT_SIZE: u64 = (1 << 56) - 2;

pub(super) fn stream_header(width: u32, height: u32, fps: u32) -> Vec<u8> {
    let mut ebml = Vec::new();
    for (id, value) in [(0x4286, 1), (0x42f7, 1), (0x42f2, 4), (0x42f3, 8)] {
        uint(&mut ebml, id, value);
    }
    element(&mut ebml, 0x4282, b"matroska");
    uint(&mut ebml, 0x4287, 4);
    uint(&mut ebml, 0x4285, 2);
    let mut header = Vec::new();
    element(&mut header, 0x1a45dfa3, &ebml);
    // Segment length is unknown until the input pipe closes.
    header.extend_from_slice(&[
        0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    ]);

    let mut info = Vec::new();
    uint(&mut info, 0x2ad7b1, 1_000); // One microsecond per timestamp tick.
    element(&mut info, 0x4d80, b"Beam");
    element(&mut info, 0x5741, b"Beam");
    element(&mut header, 0x1549a966, &info);

    let mut video = Vec::new();
    uint(&mut video, 0xb0, u64::from(width));
    uint(&mut video, 0xba, u64::from(height));
    element(&mut video, 0x2eb524, b"BGRA");
    let mut track = Vec::new();
    uint(&mut track, 0xd7, 1);
    uint(&mut track, 0x73c5, 1);
    uint(&mut track, 0x83, 1);
    element(&mut track, 0x86, b"V_UNCOMPRESSED");
    uint(&mut track, 0x23e383, 1_000_000_000 / u64::from(fps));
    element(&mut track, 0xe0, &video);
    let mut tracks = Vec::new();
    element(&mut tracks, 0xae, &track);
    element(&mut header, 0x1654ae6b, &tracks);
    header
}

pub(super) fn frame_header(timestamp_ns: u64, pixel_bytes: usize) -> Result<Vec<u8>, CaptureError> {
    let mut timestamp = Vec::new();
    uint(&mut timestamp, 0xe7, timestamp_ns / 1_000);
    // SimpleBlock: track 1, relative timestamp 0, independently decodable frame.
    let block_size = (pixel_bytes as u64).checked_add(4);
    let cluster_size = block_size.and_then(|size| size.checked_add(timestamp.len() as u64 + 9));
    let (Some(block_size), Some(cluster_size)) = (block_size, cluster_size) else {
        return Err(CaptureError::InvalidConfiguration(
            "video packet size overflows".into(),
        ));
    };
    if cluster_size > MAX_ELEMENT_SIZE {
        return Err(CaptureError::InvalidConfiguration(
            "video packet exceeds Matroska size limit".into(),
        ));
    }
    let mut header = Vec::new();
    header.extend_from_slice(&[0x1f, 0x43, 0xb6, 0x75]);
    size(&mut header, cluster_size);
    header.extend_from_slice(&timestamp);
    header.push(0xa3);
    size(&mut header, block_size);
    header.extend_from_slice(&[0x81, 0, 0, 0x80]);
    Ok(header)
}

fn size(output: &mut Vec<u8>, value: u64) {
    // Eight-byte EBML sizes avoid reallocating/backpatching a pixel payload.
    output.extend_from_slice(&((1 << 56) | value).to_be_bytes());
}

fn element(output: &mut Vec<u8>, id: u32, data: &[u8]) {
    let bytes = id.to_be_bytes();
    let first = bytes.iter().position(|byte| *byte != 0).unwrap_or(3);
    output.extend_from_slice(&bytes[first..]);
    size(output, data.len() as u64);
    output.extend_from_slice(data);
}

fn uint(output: &mut Vec<u8>, id: u32, value: u64) {
    let bytes = value.to_be_bytes();
    let first = bytes.iter().position(|byte| *byte != 0).unwrap_or(7);
    element(output, id, &bytes[first..]);
}

#[cfg(test)]
#[path = "timestamped_video_tests.rs"]
mod tests;
