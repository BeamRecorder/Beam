#[derive(Debug, Clone)]
pub struct AudioChunk {
    pub timestamp_ns: u64,
    pub samples: Vec<f32>,
    pub channels: u16,
    pub sample_rate: u32,
}
