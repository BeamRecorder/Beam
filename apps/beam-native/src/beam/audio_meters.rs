//! Explicit audio previews while the launcher is visible; recordings reuse session levels.

#[path = "audio_meters/signal.rs"]
mod signal;
#[path = "audio_meters/types.rs"]
mod types;

use super::types::ActiveCapture;
use crate::{ServiceRegistry, json};
use beam_audio::AudioQueueLimits;
use beam_media_core::{MonotonicClock, SessionClock, StartGate};
use beam_media_engine::{AudioLevels, RecordingController};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
    mpsc,
};
use std::time::Duration;
pub(super) use types::MeterController;
use types::{Command, MeterRequest, Preview};

impl MeterController {
    /// Releases previews before the recording engine opens the selected inputs.
    pub(super) fn suspend(&self) -> Result<(), String> {
        self.allowed.store(false, Ordering::Release);
        let (reply, result) = mpsc::channel();
        self.sender
            .send(Command::Stop(reply))
            .map_err(|error| error.to_string())?;
        result
            .recv_timeout(Duration::from_secs(15))
            .map_err(|error| error.to_string())??;
        Ok(())
    }

    /// Allows explicit launcher previews again after cancellation, failure or completion.
    pub(super) fn enable(&self) {
        self.allowed.store(true, Ordering::Release);
    }
}

/// Registers real preview/session levels without opening inputs during source discovery.
pub(super) fn register(
    registry: &ServiceRegistry,
    controller: RecordingController,
    active: Arc<Mutex<Option<ActiveCapture>>>,
) -> Result<MeterController, String> {
    let (sender, receiver) = mpsc::sync_channel(8);
    let allowed = Arc::new(AtomicBool::new(true));
    let worker_allowed = allowed.clone();
    std::thread::Builder::new()
        .name("beam-audio-meters".into())
        .spawn(move || {
            let mut preview = Preview::default();
            while let Ok(command) = receiver.recv() {
                match command {
                    Command::Read(request, reply) => {
                        let result = if worker_allowed.load(Ordering::Acquire) {
                            preview.read(request)
                        } else {
                            preview.stop().map(|()| AudioLevels::default())
                        };
                        let _ = reply.send(result);
                    }
                    Command::Stop(reply) => {
                        let _ = reply.send(preview.stop().map(|()| AudioLevels::default()));
                    }
                }
            }
            if let Err(error) = preview.stop() {
                eprintln!("Beam audio meter shutdown: {error}");
            }
        })
        .map_err(|error| error.to_string())?;
    let preview = MeterController { sender, allowed };
    let read = preview.clone();
    registry.register("beam", "audioPreview", move |payload| {
        json::respond((|| {
            let request: MeterRequest = json::decode(payload)?;
            request.validate()?;
            let (reply, result) = mpsc::channel();
            read.sender
                .send(Command::Read(request, reply))
                .map_err(|error| error.to_string())?;
            result
                .recv_timeout(Duration::from_secs(15))
                .map_err(|error| error.to_string())?
        })())
    });
    registry.register("beam", "audioLevels", move |_| {
        let id = active
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .map(|capture| capture.id);
        json::respond(id.map_or_else(
            || Ok(AudioLevels::default()),
            |id| {
                controller
                    .audio_levels(id)
                    .map_err(|error| error.to_string())
            },
        ))
    });
    Ok(preview)
}

impl Preview {
    /// Reconfigures only changed inputs and drains bounded queues on visible meter reads.
    fn read(&mut self, request: MeterRequest) -> Result<AudioLevels, String> {
        if request.revision < self.revision {
            return Ok(AudioLevels::default());
        }
        self.revision = request.revision;
        if self.microphone_id != request.microphone_id
            || self.system_audio_id != request.system_audio_id
        {
            self.stop()?;
            let clock = SessionClock::start();
            let gate = Arc::new(StartGate::new());
            let limits = AudioQueueLimits {
                packets: 32,
                bytes: 2 * 1024 * 1024,
            };
            if let Some(id) = &request.microphone_id {
                self.microphone = Some(
                    beam_audio::open_microphone(Some(id), clock.clone(), gate.clone(), limits)
                        .map_err(|error| error.to_string())?,
                );
            }
            if let Some(id) = &request.system_audio_id {
                self.system_audio = match beam_audio::open_system_audio(
                    (id != "default").then_some(id.as_str()),
                    clock.clone(),
                    gate.clone(),
                    limits,
                ) {
                    Ok(capture) => Some(capture),
                    Err(error) => {
                        self.stop()?;
                        return Err(error.to_string());
                    }
                };
            }
            gate.release(clock.now_ns())
                .map_err(|error| error.to_string())?;
            self.microphone_id = request.microphone_id;
            self.system_audio_id = request.system_audio_id;
        }
        let levels = (|| {
            let microphone = self
                .microphone
                .as_ref()
                .map(|capture| {
                    signal::drain(
                        || capture.try_packet().map_err(|error| error.to_string()),
                        || capture.try_event(),
                    )
                })
                .transpose()?
                .flatten();
            let system_audio = self
                .system_audio
                .as_ref()
                .map(|capture| {
                    signal::drain(
                        || capture.try_packet().map_err(|error| error.to_string()),
                        || capture.try_event(),
                    )
                })
                .transpose()?
                .flatten();
            Ok(AudioLevels {
                microphone,
                system_audio,
            })
        })();
        if levels.is_err() {
            self.stop()?;
        }
        levels
    }

    /// Stops both streams even when one backend reports a shutdown failure.
    fn stop(&mut self) -> Result<(), String> {
        self.microphone_id = None;
        self.system_audio_id = None;
        let microphone = self.microphone.take().map_or(Ok(()), |capture| {
            capture.stop().map_err(|error| error.to_string())
        });
        let system = self.system_audio.take().map_or(Ok(()), |capture| {
            capture.stop().map_err(|error| error.to_string())
        });
        microphone.and(system)
    }
}
