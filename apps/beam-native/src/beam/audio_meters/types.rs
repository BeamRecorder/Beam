//! Typed requests for explicit, visible audio monitoring.

use beam_audio::{AudioCapture, SystemAudioCapture};
use beam_media_engine::AudioLevels;
use serde::Deserialize;
use std::sync::{
    Arc,
    atomic::AtomicBool,
    mpsc::{self, SyncSender},
};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct MeterRequest {
    pub revision: u64,
    pub microphone_id: Option<String>,
    pub system_audio_id: Option<String>,
}

impl MeterRequest {
    /// Rejects empty or oversized native identifiers before opening audio devices.
    pub(super) fn validate(&self) -> Result<(), String> {
        if [&self.microphone_id, &self.system_audio_id]
            .into_iter()
            .flatten()
            .any(|id| id.is_empty() || id.len() > 1024)
        {
            return Err("audio meter device IDs must contain 1–1024 bytes".into());
        }
        Ok(())
    }
}

pub(super) enum Command {
    Read(MeterRequest, mpsc::Sender<Result<AudioLevels, String>>),
    Stop(mpsc::Sender<Result<AudioLevels, String>>),
}

/// The worker owns platform audio streams, which never cross the service boundary.
#[derive(Clone)]
pub(in crate::beam) struct MeterController {
    pub(super) sender: SyncSender<Command>,
    pub(super) allowed: Arc<AtomicBool>,
}

#[derive(Default)]
pub(super) struct Preview {
    pub(super) revision: u64,
    pub(super) microphone_id: Option<String>,
    pub(super) system_audio_id: Option<String>,
    pub(super) microphone: Option<AudioCapture>,
    pub(super) system_audio: Option<SystemAudioCapture>,
}
