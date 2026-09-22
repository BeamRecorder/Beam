use beam_media_core::AudioPacket;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AudioQueueLimits {
    pub packets: usize,
    pub bytes: usize,
}

impl Default for AudioQueueLimits {
    fn default() -> Self {
        Self {
            packets: 256,
            bytes: 4 * 1024 * 1024,
        }
    }
}

#[derive(Debug)]
pub struct TimedAudioPacket {
    pub packet: AudioPacket<Vec<f32>>,
    pub first_sample: u64,
    pub native_capture_ns: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AudioEvent {
    Started,
    Anchor {
        native_capture_ns: u64,
        native_callback_ns: u64,
        session_ns: u64,
    },
    Dropped {
        first_sample: u64,
        frames: u32,
    },
    ClockDiscontinuity {
        first_sample: u64,
    },
    Disconnected(String),
    DeviceChanged(String),
    Failed(String),
}
