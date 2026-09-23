use beam_audio::{AudioEvent, TimedAudioPacket};
use beam_camera::CameraEvent;
use beam_media_core::{MonotonicClock, VideoFrame};
use beam_media_encode::EncodeError;
use beam_media_manifest::{TrackKind, TrackStatus};

use crate::{MeasurementPoint, SessionError};

use super::MediaSession;

impl MediaSession {
    pub fn interrupt(
        mut self,
        reason: &str,
    ) -> Result<beam_media_manifest::SessionManifest, SessionError> {
        self.manifest.warnings.push(reason.into());
        for kind in [
            TrackKind::Screen,
            TrackKind::Cursor,
            TrackKind::Camera,
            TrackKind::Microphone,
            TrackKind::SystemAudio,
        ] {
            self.mark_track(kind, TrackStatus::Interrupted, reason.into());
        }
        self.stop()
    }

    pub fn poll(&mut self) -> Result<(), SessionError> {
        if !self.started {
            return Err(SessionError::InvalidConfiguration(
                "session has not started".into(),
            ));
        }
        if self.paused {
            self.drain_screen_limit(0);
            self.drain_events();
            return Ok(());
        }
        self.observe_queues();
        self.drain_events();
        self.drain_screen_limit(64);
        self.drain_camera();
        self.drain_microphone();
        self.drain_system_audio();
        self.drain_events();
        self.observe_queues();
        let now = self.clock.now_ns();
        if now.saturating_sub(self.last_checkpoint_ns) >= 1_000_000_000 {
            self.manifest.duration_ns = self.gate.session_ns(now).unwrap_or(0);
            self.manifest_writer.checkpoint(&self.manifest)?;
            self.last_checkpoint_ns = now;
        }
        Ok(())
    }

    pub(super) fn drain_camera(&mut self) {
        self.drain_camera_limit(64);
    }

    pub(super) fn drain_camera_limit(&mut self, limit: usize) {
        for _ in 0..limit {
            let result = match self.camera.as_ref() {
                Some(camera) => camera.try_frame(),
                None => break,
            };
            match result {
                Ok(Some(frame)) => self.write_camera(frame),
                Ok(None) => break,
                Err(error) => {
                    self.mark_track(
                        TrackKind::Camera,
                        TrackStatus::Interrupted,
                        error.to_string(),
                    );
                    self.camera.take();
                    break;
                }
            }
        }
    }

    fn write_camera(&mut self, frame: VideoFrame<beam_camera::CameraFrame>) {
        let kind = TrackKind::Camera;
        if let Some(track) = self.track_mut(kind) {
            track.metrics.frames_acquired += 1;
            track.metrics.frames_received += 1;
        }
        self.measurements.camera.record(MeasurementPoint {
            session_ns: frame.captured_ns,
            native_ns: frame.data.native_timestamp_ns,
            sample_position: None,
        });
        let rgba = match frame.data.to_rgba() {
            Ok(rgba) => rgba,
            Err(error) => {
                self.fail_camera(error.to_string());
                return;
            }
        };
        let duration_ns = self
            .camera
            .as_ref()
            .map(|camera| 1_000_000_000 / u64::from(camera.format().fps))
            .unwrap_or(1);
        if frame.captured_ns < self.segment_start_ns {
            return;
        }
        let owned = VideoFrame {
            captured_ns: frame.captured_ns - self.segment_start_ns,
            width: frame.width,
            height: frame.height,
            data: rgba,
        };
        let result = self
            .camera_writer
            .as_ref()
            .map(|writer| writer.push_video(owned, duration_ns));
        match result {
            Some(Ok(())) => {
                if let Some(track) = self.track_mut(kind) {
                    track.metrics.frames_encoded += 1;
                }
            }
            Some(Err(EncodeError::QueueFull { .. })) => {
                if let Some(track) = self.track_mut(kind) {
                    track.metrics.frames_dropped += 1;
                }
            }
            Some(Err(error)) => self.fail_camera(error.to_string()),
            None => {}
        }
    }

    fn fail_camera(&mut self, reason: String) {
        self.mark_track(TrackKind::Camera, TrackStatus::Failed, reason);
        self.camera_writer.take();
        self.camera.take();
    }

    pub(super) fn drain_microphone(&mut self) {
        self.drain_microphone_limit(128);
    }

    pub(super) fn drain_microphone_limit(&mut self, limit: usize) {
        for _ in 0..limit {
            let result = match self.microphone.as_ref() {
                Some(capture) => capture.try_packet(),
                None => break,
            };
            match result {
                Ok(Some(packet)) => self.write_audio(packet, TrackKind::Microphone),
                Ok(None) => break,
                Err(error) => {
                    self.mark_track(
                        TrackKind::Microphone,
                        TrackStatus::Interrupted,
                        error.to_string(),
                    );
                    self.microphone.take();
                    break;
                }
            }
        }
    }

    pub(super) fn drain_system_audio(&mut self) {
        self.drain_system_audio_limit(128);
    }

    pub(super) fn drain_system_audio_limit(&mut self, limit: usize) {
        for _ in 0..limit {
            let result = match self.system_audio.as_ref() {
                Some(capture) => capture.try_packet(),
                None => break,
            };
            match result {
                Ok(Some(packet)) => self.write_audio(packet, TrackKind::SystemAudio),
                Ok(None) => break,
                Err(error) => {
                    self.mark_track(
                        TrackKind::SystemAudio,
                        TrackStatus::Interrupted,
                        error.to_string(),
                    );
                    self.system_audio.take();
                    break;
                }
            }
        }
    }

    fn write_audio(&mut self, mut packet: TimedAudioPacket, kind: TrackKind) {
        if packet.packet.start_ns < self.segment_start_ns {
            return;
        }

        let values = &packet.packet.data;
        if !values.is_empty() && values.iter().all(|value| value.is_finite()) {
            let peak = values
                .iter()
                .fold(0.0_f32, |peak, value| peak.max(value.abs()));
            let squares: f64 = values.iter().map(|value| f64::from(*value).powi(2)).sum();
            let level = crate::AudioLevel {
                timestamp_ns: packet.packet.start_ns,
                peak,
                rms: (squares / values.len() as f64).sqrt() as f32,
            };
            match kind {
                TrackKind::Microphone => self.audio_levels.microphone = Some(level),
                TrackKind::SystemAudio => self.audio_levels.system_audio = Some(level),
                _ => {}
            }
        }
        let frames = u64::from(packet.packet.frames);
        let measurements = match kind {
            TrackKind::Microphone => &mut self.measurements.microphone,
            TrackKind::SystemAudio => &mut self.measurements.system_audio,
            _ => return,
        };
        measurements.record(MeasurementPoint {
            session_ns: packet.packet.start_ns,
            native_ns: packet.native_capture_ns,
            sample_position: Some(packet.first_sample),
        });
        if let Some(track) = self.track_mut(kind) {
            track.metrics.samples_received += frames;
        }
        let writer = match kind {
            TrackKind::Microphone => self.microphone_writer.as_ref(),
            TrackKind::SystemAudio => self.system_writer.as_ref(),
            _ => None,
        };
        packet.packet.start_ns -= self.segment_start_ns;
        let result = writer.map(|writer| writer.push_audio(packet.packet));
        match result {
            Some(Ok(())) => {}
            Some(Err(EncodeError::QueueFull { .. })) => {
                if let Some(track) = self.track_mut(kind) {
                    track.metrics.samples_dropped += frames;
                }
            }
            Some(Err(error)) => {
                self.mark_track(kind, TrackStatus::Failed, error.to_string());
                match kind {
                    TrackKind::Microphone => {
                        self.microphone_writer.take();
                        self.microphone.take();
                    }
                    TrackKind::SystemAudio => {
                        self.system_writer.take();
                        self.system_audio.take();
                    }
                    _ => {}
                }
            }
            None => {}
        }
    }

    pub(super) fn drain_events(&mut self) {
        while let Some(event) = self.camera.as_ref().and_then(|camera| camera.try_event()) {
            match event {
                CameraEvent::Dropped { .. } => {
                    self.measurements.camera.dropped += 1;
                    if let Some(track) = self.track_mut(TrackKind::Camera) {
                        track.metrics.frames_acquired += 1;
                        track.metrics.frames_dropped += 1;
                    }
                }
                CameraEvent::ClockDiscontinuity { .. } => {
                    self.measurements.camera.native_clock_discontinuous = true;
                    if let Some(track) = self.track_mut(TrackKind::Camera) {
                        track.metrics.interruptions += 1;
                    }
                }
                CameraEvent::Disconnected(reason) => {
                    self.mark_track(TrackKind::Camera, TrackStatus::Interrupted, reason)
                }
                CameraEvent::Failed(reason) => {
                    self.mark_track(TrackKind::Camera, TrackStatus::Failed, reason)
                }
                CameraEvent::Started => {}
            }
        }
        while let Some(event) = self
            .microphone
            .as_ref()
            .and_then(|microphone| microphone.try_event())
        {
            self.handle_audio_event(event, TrackKind::Microphone);
        }
        while let Some(event) = self
            .system_audio
            .as_ref()
            .and_then(|system_audio| system_audio.try_event())
        {
            self.handle_audio_event(event, TrackKind::SystemAudio);
        }
    }

    fn handle_audio_event(&mut self, event: AudioEvent, kind: TrackKind) {
        match event {
            AudioEvent::Started => {}
            AudioEvent::Anchor {
                native_capture_ns,
                session_ns,
                ..
            } => {
                let measurement = MeasurementPoint {
                    session_ns,
                    native_ns: Some(native_capture_ns),
                    sample_position: Some(0),
                };
                match kind {
                    TrackKind::Microphone => self.measurements.microphone.record(measurement),
                    TrackKind::SystemAudio => self.measurements.system_audio.record(measurement),
                    _ => {}
                }
            }
            AudioEvent::Dropped { frames, .. } => {
                if let Some(track) = self.track_mut(kind) {
                    track.metrics.samples_dropped += u64::from(frames);
                }
                match kind {
                    TrackKind::Microphone => {
                        self.measurements.microphone.dropped += u64::from(frames)
                    }
                    TrackKind::SystemAudio => {
                        self.measurements.system_audio.dropped += u64::from(frames)
                    }
                    _ => {}
                }
            }
            AudioEvent::ClockDiscontinuity { .. } => {
                match kind {
                    TrackKind::Microphone => {
                        self.measurements.microphone.native_clock_discontinuous = true;
                    }
                    TrackKind::SystemAudio => {
                        self.measurements.system_audio.native_clock_discontinuous = true;
                    }
                    _ => {}
                }
                if let Some(track) = self.track_mut(kind) {
                    track.metrics.interruptions += 1;
                }
            }
            AudioEvent::Disconnected(reason) | AudioEvent::DeviceChanged(reason) => {
                self.mark_track(kind, TrackStatus::Interrupted, reason);
            }
            AudioEvent::Failed(reason) => self.mark_track(kind, TrackStatus::Failed, reason),
        }
    }

    pub(super) fn mark_track(&mut self, kind: TrackKind, status: TrackStatus, reason: String) {
        if let Some(track) = self.track_mut(kind)
            && matches!(
                track.status,
                TrackStatus::Preparing | TrackStatus::Recording | TrackStatus::Paused
            )
        {
            track.status = status;
            track.termination_reason = Some(reason);
            track.metrics.interruptions += 1;
        }
    }
}
