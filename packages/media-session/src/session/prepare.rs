use std::sync::Arc;

#[path = "../../test/session/prepare_helpers.rs"]
mod prepare_checks;

use beam_audio::{AudioError, AudioQueueLimits};
use beam_camera::{CameraQueueLimits, CameraRequest};
use beam_media_core::{MonotonicClock, SessionClock, StartGate};
use beam_media_encode::{AudioConfig, QueueLimits, TrackWriter, VideoConfig};
use beam_media_manifest::{
    ManifestWriter, PermissionSnapshot, PlatformMetadata, ProjectId, SCHEMA_VERSION, SegmentId,
    SegmentMetadata, SelectedSources, SessionId, SessionLayout, SessionManifest, SourceId,
    TrackFormat, TrackId, TrackKind, TrackMetadata, TrackMetrics, TrackStatus,
};

use crate::{AudioSelection, CameraSelection, SessionConfig, SessionError};
use crate::{
    AudioSource,
    source::{NativeSources, SourceFactory},
};

use super::MediaSession;

pub(super) const ENCODE_LIMITS: QueueLimits = QueueLimits {
    packets: 32,
    bytes: 64 * 1024 * 1024,
};

impl MediaSession {
    pub fn prepare(config: SessionConfig) -> Result<Self, SessionError> {
        Self::prepare_with_factory(config, &NativeSources)
    }

    /// Prepare under the project identity assigned by the embedding host.
    pub fn prepare_for_project(
        config: SessionConfig,
        project_id: ProjectId,
    ) -> Result<Self, SessionError> {
        Self::prepare_project_with_factory(config, &NativeSources, project_id)
    }

    fn prepare_with_factory(
        config: SessionConfig,
        sources: &impl SourceFactory,
    ) -> Result<Self, SessionError> {
        Self::prepare_project_with_factory(config, sources, ProjectId::new())
    }

    fn prepare_project_with_factory(
        config: SessionConfig,
        sources: &impl SourceFactory,
        project_id: ProjectId,
    ) -> Result<Self, SessionError> {
        if config.output_dir.as_os_str().is_empty() {
            return Err(SessionError::InvalidConfiguration(
                "session output directory is empty".into(),
            ));
        }
        let layout = SessionLayout::new(&config.output_dir);
        if layout.manifest().exists() || layout.partial_manifest().exists() {
            return Err(SessionError::InvalidConfiguration(
                "session output already contains a manifest".into(),
            ));
        }
        layout.create()?;
        let clock = SessionClock::start();
        let gate = Arc::new(StartGate::new());
        let created_at_utc = time::OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)?;
        let manifest = SessionManifest {
            schema_version: SCHEMA_VERSION,
            project_id,
            session_id: SessionId::new(),
            created_at_utc,
            session_start_monotonic_ns: 0,
            duration_ns: 0,
            platform: PlatformMetadata {
                os: std::env::consts::OS.into(),
                architecture: std::env::consts::ARCH.into(),
                backend: "beam-native-prototype".into(),
            },
            selected_sources: SelectedSources {
                screen: None,
                system_audio: None,
                microphone: None,
                camera: None,
            },
            tracks: Vec::new(),
            permissions: PermissionSnapshot::default(),
            warnings: Vec::new(),
            completed: false,
        };
        let mut session = Self {
            manifest_writer: ManifestWriter::new(layout.clone()),
            layout,
            manifest,
            measurements: Default::default(),
            clock,
            gate,
            screen: None,
            screen_writer: None,
            screen_fps: 0,
            screen_telemetry: None,
            camera: None,
            camera_writer: None,
            microphone: None,
            microphone_writer: None,
            system_audio: None,
            system_writer: None,
            audio_levels: crate::AudioLevels::default(),
            started: false,
            paused: false,
            segment_start_ns: 0,
            last_checkpoint_ns: 0,
        };
        session.prepare_screen(config.screen, sources)?;
        match config.camera {
            CameraSelection::Disabled => {}
            CameraSelection::Device(camera) => session.prepare_camera(camera, sources)?,
            CameraSelection::FirstAvailable { width, height, fps } => {
                session.prepare_default_camera(width, height, fps, sources)?;
            }
        }
        session.prepare_microphone(config.microphone, sources)?;
        session.prepare_system_audio(config.system_audio, sources)?;
        session.manifest_writer.checkpoint(&session.manifest)?;
        Ok(session)
    }

    pub fn start(&mut self) -> Result<(), SessionError> {
        if self.started {
            return Err(SessionError::InvalidConfiguration(
                "session was already started".into(),
            ));
        }
        let start_ns = self.clock.now_ns();
        self.gate.release(start_ns)?;
        self.manifest.session_start_monotonic_ns = start_ns;
        for track in &mut self.manifest.tracks {
            if track.status == TrackStatus::Preparing {
                track.status = TrackStatus::Recording;
            }
        }
        self.started = true;
        self.manifest_writer.checkpoint(&self.manifest)?;
        Ok(())
    }

    fn prepare_camera(
        &mut self,
        request: CameraRequest,
        sources: &impl SourceFactory,
    ) -> Result<(), SessionError> {
        let source_id = SourceId::new(request.device_id.clone())?;
        self.manifest.selected_sources.camera = Some(source_id.clone());
        let result = sources.open_camera(
            request,
            self.clock.clone(),
            self.gate.clone(),
            CameraQueueLimits::default(),
        );
        let capture = match result {
            Ok(capture) => capture,
            Err(error) => {
                self.manifest.tracks.push(failed_track(
                    TrackKind::Camera,
                    Some(source_id),
                    unavailable_video(),
                    error.to_string(),
                ));
                return Ok(());
            }
        };
        let format = capture.format();
        let video = VideoConfig {
            width: format.width,
            height: format.height,
            fps: format.fps,
        };
        let path = self.layout.root().join("camera.webm");
        match TrackWriter::open_video(&path, video, ENCODE_LIMITS) {
            Ok(writer) => {
                let encoding = writer.video_encoding().ok_or_else(|| {
                    SessionError::InvalidConfiguration("camera writer has no video encoding".into())
                })?;
                self.camera = Some(capture);
                self.camera_writer = Some(writer);
                self.manifest.tracks.push(prepared_track(
                    TrackKind::Camera,
                    source_id,
                    TrackFormat::Video {
                        codec: encoding.codec.into(),
                        width: video.width,
                        height: video.height,
                        nominal_fps: video.fps,
                    },
                    "camera.webm",
                ));
            }
            Err(error) => self.manifest.tracks.push(failed_track(
                TrackKind::Camera,
                Some(source_id),
                unavailable_video(),
                error.to_string(),
            )),
        }
        Ok(())
    }

    fn prepare_default_camera(
        &mut self,
        width: u32,
        height: u32,
        fps: u32,
        sources: &impl SourceFactory,
    ) -> Result<(), SessionError> {
        let result = sources.list_cameras().and_then(|devices| {
            devices
                .into_iter()
                .next()
                .ok_or_else(|| beam_camera::CameraError::DeviceUnavailable("default camera".into()))
        });
        match result {
            Ok(device) => self.prepare_camera(
                CameraRequest {
                    device_id: device.id,
                    width,
                    height,
                    fps,
                },
                sources,
            ),
            Err(error) => {
                self.manifest.tracks.push(failed_track(
                    TrackKind::Camera,
                    None,
                    unavailable_video(),
                    error.to_string(),
                ));
                Ok(())
            }
        }
    }

    fn prepare_microphone(
        &mut self,
        selection: AudioSelection,
        sources: &impl SourceFactory,
    ) -> Result<(), SessionError> {
        let Some(id) = select_audio_id(selection, || sources.list_inputs()) else {
            return Ok(());
        };
        let id = match id {
            Ok(id) => id,
            Err(error) => {
                self.manifest.tracks.push(failed_track(
                    TrackKind::Microphone,
                    None,
                    unavailable_audio(),
                    error.to_string(),
                ));
                return Ok(());
            }
        };
        let source_id = SourceId::new(id.clone())?;
        self.manifest.selected_sources.microphone = Some(source_id.clone());
        let capture = match sources.open_microphone(
            &id,
            self.clock.clone(),
            self.gate.clone(),
            AudioQueueLimits::default(),
        ) {
            Ok(capture) => capture,
            Err(error) => {
                self.manifest.tracks.push(failed_track(
                    TrackKind::Microphone,
                    Some(source_id),
                    unavailable_audio(),
                    error.to_string(),
                ));
                return Ok(());
            }
        };
        self.install_audio_writer(capture, source_id, TrackKind::Microphone);
        Ok(())
    }

    fn prepare_system_audio(
        &mut self,
        selection: AudioSelection,
        sources: &impl SourceFactory,
    ) -> Result<(), SessionError> {
        let Some(id) = select_audio_id(selection, || sources.list_system_outputs()) else {
            return Ok(());
        };
        let id = match id {
            Ok(id) => id,
            Err(error) => {
                self.manifest.tracks.push(failed_track(
                    TrackKind::SystemAudio,
                    None,
                    unavailable_audio(),
                    error.to_string(),
                ));
                return Ok(());
            }
        };
        let source_id = SourceId::new(id.clone())?;
        self.manifest.selected_sources.system_audio = Some(source_id.clone());
        let capture = match sources.open_system_audio(
            &id,
            self.clock.clone(),
            self.gate.clone(),
            AudioQueueLimits::default(),
        ) {
            Ok(capture) => capture,
            Err(error) => {
                self.manifest.tracks.push(failed_track(
                    TrackKind::SystemAudio,
                    Some(source_id),
                    unavailable_audio(),
                    error.to_string(),
                ));
                return Ok(());
            }
        };
        let path = self.layout.root().join("system-audio.wav");
        let (sample_rate, channels) = capture.format();
        let format = AudioConfig {
            sample_rate,
            channels,
        };
        match TrackWriter::open_audio(&path, format, ENCODE_LIMITS) {
            Ok(writer) => {
                self.system_audio = Some(capture);
                self.system_writer = Some(writer);
                self.manifest.tracks.push(prepared_track(
                    TrackKind::SystemAudio,
                    source_id,
                    track_audio_format(format),
                    "system-audio.wav",
                ));
            }
            Err(error) => self.manifest.tracks.push(failed_track(
                TrackKind::SystemAudio,
                Some(source_id),
                unavailable_audio(),
                error.to_string(),
            )),
        }
        Ok(())
    }

    fn install_audio_writer(
        &mut self,
        capture: Box<dyn AudioSource>,
        source_id: SourceId,
        kind: TrackKind,
    ) {
        let path = self.layout.root().join("microphone.wav");
        let (sample_rate, channels) = capture.format();
        let format = AudioConfig {
            sample_rate,
            channels,
        };
        match TrackWriter::open_audio(&path, format, ENCODE_LIMITS) {
            Ok(writer) => {
                self.microphone = Some(capture);
                self.microphone_writer = Some(writer);
                self.manifest.tracks.push(prepared_track(
                    kind,
                    source_id,
                    track_audio_format(format),
                    "microphone.wav",
                ));
            }
            Err(error) => self.manifest.tracks.push(failed_track(
                kind,
                Some(source_id),
                unavailable_audio(),
                error.to_string(),
            )),
        }
    }
}

fn select_audio_id(
    selection: AudioSelection,
    enumerate: impl FnOnce() -> Result<Vec<beam_audio::AudioDevice>, AudioError>,
) -> Option<Result<String, AudioError>> {
    match selection {
        AudioSelection::Disabled => None,
        AudioSelection::Device(id) => Some(Ok(id)),
        AudioSelection::Default => Some(enumerate().and_then(|devices| {
            devices
                .into_iter()
                .find(|device| device.is_default)
                .map(|device| device.id)
                .ok_or_else(|| AudioError::DeviceUnavailable("default audio device".into()))
        })),
    }
}

pub(super) fn prepared_track(
    kind: TrackKind,
    source_id: SourceId,
    format: TrackFormat,
    path: &str,
) -> TrackMetadata {
    TrackMetadata {
        track_id: TrackId::new(),
        kind,
        source_id: Some(source_id),
        format,
        segments: vec![SegmentMetadata {
            segment_id: SegmentId::new(),
            path: path.into(),
            start_ns: 0,
            end_ns: None,
            complete: false,
        }],
        metrics: TrackMetrics::default(),
        status: TrackStatus::Preparing,
        termination_reason: None,
    }
}

pub(super) fn failed_track(
    kind: TrackKind,
    source_id: Option<SourceId>,
    format: TrackFormat,
    reason: String,
) -> TrackMetadata {
    TrackMetadata {
        track_id: TrackId::new(),
        kind,
        source_id,
        format,
        segments: Vec::new(),
        metrics: TrackMetrics::default(),
        status: TrackStatus::Failed,
        termination_reason: Some(reason),
    }
}

fn track_audio_format(config: AudioConfig) -> TrackFormat {
    TrackFormat::Audio {
        sample_format: "F32LE".into(),
        sample_rate: config.sample_rate,
        channels: config.channels,
    }
}

fn unavailable_audio() -> TrackFormat {
    TrackFormat::Audio {
        sample_format: "unavailable".into(),
        sample_rate: 0,
        channels: 0,
    }
}

pub(super) fn unavailable_video() -> TrackFormat {
    TrackFormat::Video {
        codec: "unavailable".into(),
        width: 0,
        height: 0,
        nominal_fps: 0,
    }
}

#[path = "../../test/session/prepare_factory.rs"]
mod factory_checks;
