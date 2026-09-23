use std::{path::PathBuf, sync::Arc};

use beam_camera::CameraRequest;
use beam_media_core::{MonotonicClock, SessionClock, StartGate};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AudioSelection {
    Disabled,
    Default,
    Device(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CameraSelection {
    Disabled,
    FirstAvailable { width: u32, height: u32, fps: u32 },
    Device(CameraRequest),
}

#[derive(Debug, Clone, PartialEq)]
pub struct SessionConfig {
    pub output_dir: PathBuf,
    pub screen: Option<beam_screen::ScreenRequest>,
    pub camera: CameraSelection,
    pub microphone: AudioSelection,
    pub system_audio: AudioSelection,
}

/// A read-only view of the recording timeline for independent consumers.
#[derive(Clone)]
pub struct SessionTimeline {
    clock: SessionClock,
    gate: Arc<StartGate>,
}

impl SessionTimeline {
    pub(crate) fn new(clock: SessionClock, gate: Arc<StartGate>) -> Self {
        Self { clock, gate }
    }

    pub fn now_ns(&self) -> Option<u64> {
        self.gate.session_ns(self.clock.now_ns())
    }
}

/// Latest levels from packets consumed by the recording session, never a second stream.
#[derive(Debug, Clone, Copy, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioLevel {
    pub timestamp_ns: u64,
    pub peak: f32,
    pub rms: f32,
}
#[derive(Debug, Clone, Copy, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioLevels {
    pub microphone: Option<AudioLevel>,
    pub system_audio: Option<AudioLevel>,
}
