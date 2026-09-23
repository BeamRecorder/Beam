use super::{MediaSession, prepare::ENCODE_LIMITS};
use crate::SessionError;
use beam_media_core::MonotonicClock;
use beam_media_encode::{AudioConfig, TrackWriter, VideoConfig};
use beam_media_manifest::{SegmentId, SegmentMetadata, TrackFormat, TrackKind, TrackStatus};

impl MediaSession {
    pub fn pause(&mut self) -> Result<(), SessionError> {
        if !self.started || self.paused {
            return Err(SessionError::InvalidConfiguration(
                "only a recording session can pause".into(),
            ));
        }
        let end = self.gate.pause(self.clock.now_ns())?;
        self.drain_pending_sources();
        self.drain_events();
        for kind in [
            TrackKind::Screen,
            TrackKind::Camera,
            TrackKind::Microphone,
            TrackKind::SystemAudio,
        ] {
            let writer = match kind {
                TrackKind::Screen => self.screen_writer.take(),
                TrackKind::Camera => self.camera_writer.take(),
                TrackKind::Microphone => self.microphone_writer.take(),
                TrackKind::SystemAudio => self.system_writer.take(),
                _ => None,
            };
            self.finish_track(kind, writer, end);
            if let Some(track) = self.track_mut(kind)
                && track.status == TrackStatus::Completed
            {
                track.status = TrackStatus::Paused;
            }
        }
        self.paused = true;
        self.segment_start_ns = end;
        self.manifest.duration_ns = end;
        self.manifest_writer.checkpoint(&self.manifest)?;
        Ok(())
    }

    pub fn resume(&mut self) -> Result<(), SessionError> {
        if !self.paused {
            return Err(SessionError::InvalidConfiguration(
                "only a paused session can resume".into(),
            ));
        }
        if self
            .manifest
            .tracks
            .iter()
            .any(|track| track.segments.len() >= 4096)
        {
            return Err(SessionError::InvalidConfiguration(
                "session segment limit reached".into(),
            ));
        }
        // Frames accepted just before pause must not enter a new segment.
        self.discard_pending()?;
        self.drain_screen_limit(0);
        self.drain_events();
        for kind in [
            TrackKind::Screen,
            TrackKind::Camera,
            TrackKind::Microphone,
            TrackKind::SystemAudio,
        ] {
            let Some(track) = self
                .manifest
                .tracks
                .iter()
                .find(|track| track.kind == kind && track.status == TrackStatus::Paused)
            else {
                continue;
            };
            let suffix = track.segments.len();
            let (name, extension) = match kind {
                TrackKind::Screen => ("screen", "webm"),
                TrackKind::Camera => ("camera", "webm"),
                TrackKind::Microphone => ("microphone", "wav"),
                TrackKind::SystemAudio => ("system-audio", "wav"),
                _ => continue,
            };
            let path = format!("{name}-{suffix}.{extension}");
            let output = self.layout.root().join(&path);
            let result = match track.format {
                TrackFormat::Video {
                    width,
                    height,
                    nominal_fps,
                    ..
                } => TrackWriter::open_video(
                    &output,
                    VideoConfig {
                        width,
                        height,
                        fps: nominal_fps,
                    },
                    ENCODE_LIMITS,
                ),
                TrackFormat::Audio {
                    sample_rate,
                    channels,
                    ..
                } => TrackWriter::open_audio(
                    &output,
                    AudioConfig {
                        sample_rate,
                        channels,
                    },
                    ENCODE_LIMITS,
                ),
                _ => continue,
            };
            match result {
                Ok(writer) => {
                    match kind {
                        TrackKind::Screen => self.screen_writer = Some(writer),
                        TrackKind::Camera => self.camera_writer = Some(writer),
                        TrackKind::Microphone => self.microphone_writer = Some(writer),
                        TrackKind::SystemAudio => self.system_writer = Some(writer),
                        _ => {}
                    }
                    let start_ns = self.segment_start_ns;
                    if let Some(track) = self.track_mut(kind) {
                        track.segments.push(SegmentMetadata {
                            segment_id: SegmentId::new(),
                            path,
                            start_ns,
                            end_ns: None,
                            complete: false,
                        });
                        track.status = TrackStatus::Recording;
                    }
                }
                Err(error) => self.mark_track(kind, TrackStatus::Failed, error.to_string()),
            }
        }
        self.audio_levels = crate::AudioLevels::default();
        // Native clocks advance during pauses; one drift slope across that gap
        // would measure the excluded pause rather than capture clock accuracy.
        for measurements in [
            &mut self.measurements.screen,
            &mut self.measurements.camera,
            &mut self.measurements.microphone,
            &mut self.measurements.system_audio,
        ] {
            measurements.native_clock_discontinuous = true;
        }
        self.gate.resume(self.clock.now_ns())?;
        self.paused = false;
        self.manifest_writer.checkpoint(&self.manifest)?;
        Ok(())
    }

    fn discard_pending(&mut self) -> Result<(), SessionError> {
        if let Some(source) = &self.screen {
            for _ in 0..source.queue_depth().0 {
                let _ = source.try_frame()?;
            }
        }
        if let Some(source) = &self.camera {
            for _ in 0..source.queue_depth().0 {
                source
                    .try_frame()
                    .map_err(|e| SessionError::InvalidConfiguration(e.to_string()))?;
            }
        }
        for source in [&self.microphone, &self.system_audio].into_iter().flatten() {
            for _ in 0..source.queue_depth().0 {
                source
                    .try_packet()
                    .map_err(|e| SessionError::InvalidConfiguration(e.to_string()))?;
            }
        }
        Ok(())
    }
}
