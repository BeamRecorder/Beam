/// A camera or screen frame in the shared session timeline.
#[derive(Debug, Clone)]
pub struct VideoFrame<T> {
    pub captured_ns: u64,
    pub width: u32,
    pub height: u32,
    pub data: T,
}

/// One interleaved audio packet in the shared session timeline.
#[derive(Debug)]
pub struct AudioPacket<T> {
    pub start_ns: u64,
    pub sample_rate: u32,
    pub channels: u16,
    pub frames: u32,
    pub data: T,
}
