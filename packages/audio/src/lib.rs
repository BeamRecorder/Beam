//! Native audio capture with explicit device and session timing contracts.

mod cpal_capture;
mod error;
#[cfg(target_os = "macos")]
mod macos;
mod queue;
mod timing;
mod types;

pub use cpal_capture::{AudioCapture, list_inputs, open_microphone};
#[cfg(any(target_os = "windows", target_os = "macos"))]
pub use cpal_capture::{list_system_outputs, open_system_audio};
#[cfg(any(target_os = "windows", target_os = "macos"))]
pub type SystemAudioCapture = AudioCapture;
pub use error::AudioError;
pub use timing::{AudioAnchor, AudioTimeline, PacketTiming};
pub use types::{AudioDevice, AudioEvent, AudioQueueLimits, TimedAudioPacket};

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::{SystemAudioCapture, list_system_outputs, open_system_audio};
