#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
#[cfg(test)]
pub(crate) mod fixtures {
    use crate::{AudioSelection, CameraPreview, EngineError, RecordingConfig, backend::Session};
    use beam_media_manifest::{
        PermissionSnapshot, PlatformMetadata, ProjectId, SelectedSources, SessionId,
        SessionManifest, TrackFormat, TrackId, TrackKind, TrackMetadata, TrackStatus,
    };
    use std::path::PathBuf;

    pub(crate) struct FakeSession {
        pub(crate) manifest: SessionManifest,
        mode: String,
    }
    pub(crate) fn manifest() -> SessionManifest {
        SessionManifest {
            cursor_mode: Default::default(),
            schema_version: 2,
            project_id: ProjectId::new(),
            session_id: SessionId::new(),
            created_at_utc: "2026-09-22T00:00:00Z".into(),
            session_start_monotonic_ns: 0,
            duration_ns: 0,
            platform: PlatformMetadata {
                os: "test".into(),
                architecture: "test".into(),
                backend: "test".into(),
            },
            selected_sources: SelectedSources {
                screen: None,
                camera: None,
                microphone: None,
                system_audio: None,
            },
            permissions: PermissionSnapshot::default(),
            warnings: vec![],
            completed: false,
            tracks: vec![TrackMetadata {
                track_id: TrackId::new(),
                kind: TrackKind::Microphone,
                source_id: None,
                format: TrackFormat::Audio {
                    sample_format: "f32".into(),
                    sample_rate: 48000,
                    channels: 1,
                },
                segments: vec![],
                metrics: Default::default(),
                status: TrackStatus::Preparing,
                termination_reason: None,
            }],
        }
    }
    pub(crate) fn prepare(
        config: RecordingConfig,
        _: PathBuf,
    ) -> Result<Box<dyn Session>, EngineError> {
        let mode = match config.microphone {
            AudioSelection::Device(mode) => mode,
            _ => String::new(),
        };
        if mode == "prepare-error" {
            return Err(EngineError::Media(mode));
        }
        let mut manifest = manifest();
        manifest.project_id = config.project_id;
        if mode == "no-track" {
            manifest.tracks.clear();
        }
        Ok(Box::new(FakeSession { manifest, mode }))
    }
    impl Session for FakeSession {
        fn audio_levels(&self) -> beam_media_session::AudioLevels {
            Default::default()
        }

        fn manifest(&self) -> &SessionManifest {
            &self.manifest
        }
        fn start(&mut self) -> Result<(), EngineError> {
            if self.mode == "start-error" {
                return Err(EngineError::Media(self.mode.clone()));
            }
            self.manifest.tracks[0].status = TrackStatus::Recording;
            Ok(())
        }
        fn pause(&mut self) -> Result<(), EngineError> {
            Ok(())
        }
        fn resume(&mut self) -> Result<(), EngineError> {
            Ok(())
        }
        fn poll(&mut self) -> Result<(), EngineError> {
            if self.mode == "poll-panic" {
                panic!("simulated backend panic");
            }
            if self.mode == "source-lost" {
                self.manifest.tracks[0].status = TrackStatus::Failed;
            }
            if self.mode == "poll-error" {
                return Err(EngineError::Media(self.mode.clone()));
            }
            self.manifest.duration_ns += 1;
            Ok(())
        }
        fn screen_preview(&self) -> Option<beam_screen::ScreenPreview> {
            None
        }
        fn preview(&self) -> Option<CameraPreview> {
            None
        }
        fn finish(
            mut self: Box<Self>,
            interruption: Option<&str>,
        ) -> Result<SessionManifest, EngineError> {
            if self.mode == "finish-error" {
                return Err(EngineError::Media(self.mode.clone()));
            }
            self.manifest.completed = interruption.is_none();
            for track in &mut self.manifest.tracks {
                track.status = if interruption.is_some() {
                    TrackStatus::Interrupted
                } else {
                    TrackStatus::Completed
                };
            }
            Ok(self.manifest)
        }
    }
}

#[cfg(test)]
mod checks {
    use crate::{AudioSelection, CameraSelection, ProjectId, RecordingConfig, backend};
    fn config() -> RecordingConfig {
        RecordingConfig {
            output: Default::default(),
            screen: None,
            project_id: ProjectId::new(),
            camera: CameraSelection::Disabled,
            microphone: AudioSelection::Disabled,
            system_audio: AudioSelection::Disabled,
        }
    }
    #[test]
    fn native_adapter_drives_real_session_and_finalization() {
        let root = tempfile::tempdir().unwrap();
        let mut session = backend::prepare(config(), root.path().join("session")).unwrap();
        assert!(session.preview().is_none());
        session.start().unwrap();
        session.poll().unwrap();
        let manifest = session.finish(None).unwrap();
        assert!(!manifest.completed); // An empty real session never claims captured media.
    }
    #[test]
    fn native_adapter_propagates_transition_errors() {
        let root = tempfile::tempdir().unwrap();
        let mut session = backend::prepare(config(), root.path().join("session")).unwrap();
        assert!(session.poll().is_err());
        session.start().unwrap();
        assert!(session.start().is_err());
        assert!(!session.finish(Some("host cancelled")).unwrap().completed);
    }
    #[test]
    fn native_adapter_propagates_storage_failure() {
        let file = tempfile::NamedTempFile::new().unwrap();
        assert!(backend::prepare(config(), file.path().join("session")).is_err());
    }
}
