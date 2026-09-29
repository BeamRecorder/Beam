use beam_media_core::MonotonicClock;
use beam_media_encode::TrackWriter;
use beam_media_manifest::{SessionManifest, TrackKind, TrackStatus, write_atomic};

use crate::SessionError;

use super::MediaSession;

const MAX_DRAIN_ROUNDS: usize = 1024;
const MAX_STALLED_DRAIN_ROUNDS: usize = 2;

impl MediaSession {
    pub fn stop(mut self) -> Result<SessionManifest, SessionError> {
        let end_clock_ns = self.clock.now_ns();
        self.gate.close();
        self.observe_queues();
        self.drain_events();
        self.halt_sources();
        self.drain_pending_sources();
        self.drain_events();
        self.observe_queues();
        self.finish_telemetry(end_clock_ns);
        self.finish_sources(end_clock_ns);
        self.persist_completion()?;
        Ok(self.manifest)
    }

    fn halt_sources(&mut self) {
        if let Some(screen) = self.screen.as_mut()
            && let Err(error) = screen.halt()
        {
            self.mark_track(
                TrackKind::Screen,
                TrackStatus::Interrupted,
                error.to_string(),
            );
        }
        if let Some(camera) = self.camera.as_mut()
            && let Err(error) = camera.halt()
        {
            self.mark_track(
                TrackKind::Camera,
                TrackStatus::Interrupted,
                error.to_string(),
            );
        }
        if let Some(microphone) = self.microphone.as_mut()
            && let Err(error) = microphone.halt()
        {
            self.mark_track(
                TrackKind::Microphone,
                TrackStatus::Interrupted,
                error.to_string(),
            );
        }
        if let Some(system_audio) = self.system_audio.as_mut()
            && let Err(error) = system_audio.halt()
        {
            self.mark_track(
                TrackKind::SystemAudio,
                TrackStatus::Interrupted,
                error.to_string(),
            );
        }
    }

    fn finish_telemetry(&mut self, end_clock_ns: u64) {
        if let Some(telemetry) = self.screen_telemetry.take() {
            match telemetry.finish() {
                Ok(()) => {
                    let end = self.gate.elapsed_ns(end_clock_ns).unwrap_or(0);
                    let started = self.started;
                    if let Some(track) = self.track_mut(TrackKind::Cursor) {
                        if matches!(
                            track.status,
                            TrackStatus::Preparing | TrackStatus::Recording
                        ) {
                            track.status = if started {
                                TrackStatus::Completed
                            } else {
                                TrackStatus::Interrupted
                            };
                        }
                        if let Some(segment) = track.segments.last_mut() {
                            segment.end_ns = Some(end);
                            segment.complete = started;
                        }
                    }
                }
                Err(error) => {
                    self.mark_track(TrackKind::Cursor, TrackStatus::Failed, error.to_string())
                }
            }
        }
    }

    fn finish_sources(&mut self, end_clock_ns: u64) {
        self.screen.take();
        self.camera.take();
        self.microphone.take();
        self.system_audio.take();
        let duration_ns = self.gate.elapsed_ns(end_clock_ns).unwrap_or(0);
        self.manifest.duration_ns = duration_ns;

        let screen = self.screen_writer.take();
        let camera = self.camera_writer.take();
        let microphone = self.microphone_writer.take();
        let system = self.system_writer.take();
        self.finish_track(TrackKind::Screen, screen, duration_ns);
        self.finish_track(TrackKind::Camera, camera, duration_ns);
        self.finish_track(TrackKind::Microphone, microphone, duration_ns);
        self.finish_track(TrackKind::SystemAudio, system, duration_ns);

        for track in &mut self.manifest.tracks {
            if track.status == TrackStatus::Paused {
                track.status = TrackStatus::Completed;
            }
        }
    }

    fn persist_completion(&mut self) -> Result<(), SessionError> {
        let measurements_path = self.layout.root().join("measurements.json");
        let measurements_result = write_atomic(
            &measurements_path,
            &serde_json::to_vec_pretty(&self.measurements)?,
        );
        if let Err(error) = &measurements_result {
            self.manifest
                .warnings
                .push(format!("measurements could not be saved: {error}"));
        }
        let successful = self.started
            && measurements_result.is_ok()
            && !self.manifest.tracks.is_empty()
            && self
                .manifest
                .tracks
                .iter()
                .all(|track| track.status == TrackStatus::Completed);
        self.manifest_writer
            .finalize_with_completion(&mut self.manifest, successful)?;
        measurements_result?;
        Ok(())
    }

    pub(super) fn drain_pending_sources(&mut self) {
        let mut previous_pending = usize::MAX;
        let mut stalled_rounds = 0;
        for _ in 0..MAX_DRAIN_ROUNDS {
            let screen = self
                .screen
                .as_ref()
                .map_or(0, |source| source.queue_depth().0);
            let camera = self
                .camera
                .as_ref()
                .map_or(0, |source| source.queue_depth().0);
            let microphone = self
                .microphone
                .as_ref()
                .map_or(0, |source| source.queue_depth().0);
            let system_audio = self
                .system_audio
                .as_ref()
                .map_or(0, |source| source.queue_depth().0);
            let pending = screen
                .saturating_add(camera)
                .saturating_add(microphone)
                .saturating_add(system_audio);
            if pending == 0 {
                break;
            }
            if pending >= previous_pending {
                stalled_rounds += 1;
                if stalled_rounds >= MAX_STALLED_DRAIN_ROUNDS {
                    break;
                }
            } else {
                stalled_rounds = 0;
            }
            previous_pending = pending;
            self.drain_screen_limit(screen.min(64));
            self.drain_camera_limit(camera.min(64));
            self.drain_microphone_limit(microphone.min(128));
            self.drain_system_audio_limit(system_audio.min(128));
        }
        for (kind, pending) in [
            (
                TrackKind::Screen,
                self.screen
                    .as_ref()
                    .map_or(0, |source| source.queue_depth().0),
            ),
            (
                TrackKind::Camera,
                self.camera
                    .as_ref()
                    .map_or(0, |source| source.queue_depth().0),
            ),
            (
                TrackKind::Microphone,
                self.microphone
                    .as_ref()
                    .map_or(0, |source| source.queue_depth().0),
            ),
            (
                TrackKind::SystemAudio,
                self.system_audio
                    .as_ref()
                    .map_or(0, |source| source.queue_depth().0),
            ),
        ] {
            if pending > 0 {
                self.mark_track(
                    kind,
                    TrackStatus::Interrupted,
                    "capture source queue did not drain after stop".into(),
                );
            }
        }
    }

    pub(super) fn finish_track(
        &mut self,
        kind: TrackKind,
        writer: Option<TrackWriter>,
        duration_ns: u64,
    ) {
        let Some(writer) = writer else { return };
        let had_data = writer.accepted_packet_count() > 0;
        let result = writer.finish();
        let Some(track) = self.track_mut(kind) else {
            return;
        };
        match result {
            Ok(_) => {
                if let Some(segment) = track.segments.last_mut() {
                    segment.end_ns = Some(duration_ns);
                    segment.complete = true;
                }
                if !had_data
                    && matches!(
                        track.status,
                        TrackStatus::Preparing | TrackStatus::Recording
                    )
                {
                    track.status = TrackStatus::Interrupted;
                    track.termination_reason = Some("source produced no media packets".into());
                } else if matches!(
                    track.status,
                    TrackStatus::Preparing | TrackStatus::Recording
                ) {
                    track.status = TrackStatus::Completed;
                }
            }
            Err(error) => {
                track.status = TrackStatus::Failed;
                track.termination_reason = Some(error.to_string());
            }
        }
    }
}

#[path = "../../test/session/finish_internal.rs"]
mod finish_checks;
