#[derive(Debug, Clone)]
pub enum NativeVideoFrame {
    Cpu {
        timestamp_ns: u64,
        width: u32,
        height: u32,
        bytes: Vec<u8>,
    },
    Opaque {
        timestamp_ns: u64,
        handle: u64,
    },
}
