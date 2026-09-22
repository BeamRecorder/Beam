#![cfg(test)]
#![allow(clippy::expect_used)]

use std::sync::{Arc, Mutex};

use beam_audio::{AudioDevice, AudioError, AudioEvent, AudioQueueLimits, TimedAudioPacket};
use beam_camera::{
    CameraDevice, CameraError, CameraEvent, CameraFormat, CameraFrame, CameraQueueLimits,
    CameraRequest, PixelFormat,
};
use beam_media_core::{LatestFrame, SessionClock, StartGate, VideoFrame};
use beam_media_manifest::{TrackKind, TrackStatus};

use crate::{AudioSelection, AudioSource, CameraSelection, CameraSource, SessionConfig};

use super::{MediaSession, SourceFactory};

struct SilentAudio;

impl AudioSource for SilentAudio {
    fn format(&self) -> (u32, u16) {
        (48_000, 1)
    }

    fn queue_depth(&self) -> (usize, usize) {
        (0, 0)
    }

    fn try_packet(&self) -> Result<Option<TimedAudioPacket>, AudioError> {
        Ok(None)
    }

    fn try_event(&self) -> Option<AudioEvent> {
        None
    }

    fn halt(&mut self) -> Result<(), AudioError> {
        Ok(())
    }
}

struct SilentCamera {
    latest: Arc<LatestFrame<VideoFrame<CameraFrame>>>,
}

impl CameraSource for SilentCamera {
    fn format(&self) -> CameraFormat {
        CameraFormat {
            width: 16,
            height: 16,
            fps: 30,
            pixel_format: PixelFormat::Yuyv,
            stride: 32,
        }
    }

    fn queue_depth(&self) -> (usize, usize) {
        (0, 0)
    }

    fn try_frame(&self) -> Result<Option<VideoFrame<CameraFrame>>, CameraError> {
        Ok(None)
    }

    fn latest_preview(&self) -> Option<VideoFrame<CameraFrame>> {
        self.latest.take()
    }

    fn preview_handle(&self) -> Arc<LatestFrame<VideoFrame<CameraFrame>>> {
        self.latest.clone()
    }

    fn try_event(&self) -> Option<CameraEvent> {
        None
    }

    fn halt(&mut self) -> Result<(), CameraError> {
        Ok(())
    }
}

#[derive(Default)]
struct FakeSources {
    discovery_fails: bool,
    catalog_has_no_defaults: bool,
    open_fails: bool,
    calls: Mutex<Vec<String>>,
}

fn microphone() -> AudioDevice {
    AudioDevice {
        id: "microphone-1".into(),
        name: "Test microphone".into(),
        is_default: true,
    }
}

fn output() -> AudioDevice {
    AudioDevice {
        id: "output-1".into(),
        name: "Test output".into(),
        is_default: true,
    }
}

impl SourceFactory for FakeSources {
    fn list_cameras(&self) -> Result<Vec<CameraDevice>, CameraError> {
        if self.discovery_fails {
            return Err(CameraError::DeviceUnavailable(
                "camera catalog offline".into(),
            ));
        }
        if self.catalog_has_no_defaults {
            return Ok(Vec::new());
        }
        Ok(vec![CameraDevice {
            id: "camera-1".into(),
            name: "Test camera".into(),
        }])
    }

    fn open_camera(
        &self,
        request: CameraRequest,
        _clock: SessionClock,
        _gate: Arc<StartGate>,
        _limits: CameraQueueLimits,
    ) -> Result<Box<dyn CameraSource>, CameraError> {
        self.calls.lock().expect("calls").push(request.device_id);
        if self.open_fails {
            return Err(CameraError::PermissionDenied("camera denied".into()));
        }
        Ok(Box::new(SilentCamera {
            latest: Arc::new(LatestFrame::new()),
        }))
    }

    fn list_inputs(&self) -> Result<Vec<AudioDevice>, AudioError> {
        if self.discovery_fails {
            return Err(AudioError::DeviceUnavailable(
                "input catalog offline".into(),
            ));
        }
        let mut device = microphone();
        device.is_default = !self.catalog_has_no_defaults;
        Ok(vec![device])
    }

    fn open_microphone(
        &self,
        device_id: &str,
        _clock: SessionClock,
        _gate: Arc<StartGate>,
        _limits: AudioQueueLimits,
    ) -> Result<Box<dyn AudioSource>, AudioError> {
        self.calls.lock().expect("calls").push(device_id.into());
        if self.open_fails {
            return Err(AudioError::PermissionDenied("microphone denied".into()));
        }
        Ok(Box::new(SilentAudio))
    }

    fn list_system_outputs(&self) -> Result<Vec<AudioDevice>, AudioError> {
        if self.discovery_fails {
            return Err(AudioError::DeviceUnavailable(
                "output catalog offline".into(),
            ));
        }
        let mut device = output();
        device.is_default = !self.catalog_has_no_defaults;
        Ok(vec![device])
    }

    fn open_system_audio(
        &self,
        device_id: &str,
        _clock: SessionClock,
        _gate: Arc<StartGate>,
        _limits: AudioQueueLimits,
    ) -> Result<Box<dyn AudioSource>, AudioError> {
        self.calls.lock().expect("calls").push(device_id.into());
        if self.open_fails {
            return Err(AudioError::PermissionDenied("system audio denied".into()));
        }
        Ok(Box::new(SilentAudio))
    }
}

fn all_sources(output_dir: std::path::PathBuf) -> SessionConfig {
    SessionConfig {
        output_dir,
        camera: CameraSelection::FirstAvailable {
            width: 16,
            height: 16,
            fps: 30,
        },
        microphone: AudioSelection::Default,
        system_audio: AudioSelection::Default,
    }
}

#[test]
fn factory_prepares_three_independent_tracks_and_selected_sources() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let sources = FakeSources::default();
    let mut session =
        MediaSession::prepare_with_factory(all_sources(temporary.path().join("session")), &sources)
            .expect("prepare all sources");
    assert_eq!(
        *sources.calls.lock().expect("calls"),
        ["camera-1", "microphone-1", "output-1"]
    );
    assert_eq!(session.manifest.tracks.len(), 3);
    assert!(
        session
            .manifest
            .tracks
            .iter()
            .all(|track| track.status == TrackStatus::Preparing)
    );
    assert_eq!(session.manifest.tracks[0].kind, TrackKind::Camera);
    assert_eq!(session.manifest.tracks[1].kind, TrackKind::Microphone);
    assert_eq!(session.manifest.tracks[2].kind, TrackKind::SystemAudio);
    assert!(session.manifest.selected_sources.camera.is_some());
    assert!(session.manifest.selected_sources.microphone.is_some());
    assert!(session.manifest.selected_sources.system_audio.is_some());
    session.start().expect("start");
    assert!(
        session
            .manifest
            .tracks
            .iter()
            .all(|track| track.status == TrackStatus::Recording)
    );
    let finished = session.stop().expect("stop silent session");
    assert!(!finished.completed);
    assert!(
        finished
            .tracks
            .iter()
            .all(|track| track.status == TrackStatus::Interrupted)
    );
}

#[test]
fn independent_discovery_failures_are_recorded_without_opening_sources() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let sources = FakeSources {
        discovery_fails: true,
        ..Default::default()
    };
    let session =
        MediaSession::prepare_with_factory(all_sources(temporary.path().join("session")), &sources)
            .expect("failed tracks remain in manifest");
    assert!(sources.calls.lock().expect("calls").is_empty());
    assert_eq!(session.manifest.tracks.len(), 3);
    assert!(
        session
            .manifest
            .tracks
            .iter()
            .all(|track| track.status == TrackStatus::Failed)
    );
    assert!(
        session
            .manifest
            .tracks
            .iter()
            .all(|track| track.source_id.is_none())
    );
    assert!(
        session
            .manifest
            .tracks
            .iter()
            .all(|track| track.segments.is_empty())
    );
    session.stop().expect("stop");
}

#[test]
fn catalogs_without_default_devices_leave_all_three_tracks_failed() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let sources = FakeSources {
        catalog_has_no_defaults: true,
        ..Default::default()
    };
    let session =
        MediaSession::prepare_with_factory(all_sources(temporary.path().join("session")), &sources)
            .expect("missing defaults are track failures");
    assert!(sources.calls.lock().expect("calls").is_empty());
    assert_eq!(session.manifest.tracks.len(), 3);
    assert!(
        session
            .manifest
            .tracks
            .iter()
            .all(|track| track.status == TrackStatus::Failed && track.source_id.is_none())
    );
    session.stop().expect("stop");
}

#[test]
fn explicit_device_selection_does_not_require_device_enumeration() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let sources = FakeSources {
        discovery_fails: true,
        ..Default::default()
    };
    let session = MediaSession::prepare_with_factory(
        SessionConfig {
            output_dir: temporary.path().join("session"),
            camera: CameraSelection::Device(CameraRequest {
                device_id: "camera-1".into(),
                width: 16,
                height: 16,
                fps: 30,
            }),
            microphone: AudioSelection::Device("microphone-1".into()),
            system_audio: AudioSelection::Device("output-1".into()),
        },
        &sources,
    )
    .expect("explicit sources bypass discovery");
    assert_eq!(
        *sources.calls.lock().expect("calls"),
        ["camera-1", "microphone-1", "output-1"]
    );
    assert!(
        session
            .manifest
            .tracks
            .iter()
            .all(|track| track.status == TrackStatus::Preparing)
    );
    session.stop().expect("stop");
}

#[test]
fn open_failures_keep_each_selected_source_and_do_not_create_tracks() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let sources = FakeSources {
        open_fails: true,
        ..Default::default()
    };
    let session =
        MediaSession::prepare_with_factory(all_sources(temporary.path().join("session")), &sources)
            .expect("failed tracks remain in manifest");
    assert_eq!(sources.calls.lock().expect("calls").len(), 3);
    assert_eq!(session.manifest.tracks.len(), 3);
    assert!(
        session
            .manifest
            .tracks
            .iter()
            .all(|track| track.status == TrackStatus::Failed)
    );
    assert!(
        session
            .manifest
            .tracks
            .iter()
            .all(|track| track.source_id.is_some())
    );
    assert!(
        session
            .manifest
            .tracks
            .iter()
            .all(|track| track.segments.is_empty())
    );
    session.stop().expect("stop");
}

#[test]
fn writer_open_failures_leave_all_three_tracks_failed_without_fake_media() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let output_dir = temporary.path().join("session");
    std::fs::create_dir(&output_dir).expect("output dir");
    for partial in [
        "camera.webm.part",
        "microphone.wav.part",
        "system-audio.wav.part",
    ] {
        std::fs::create_dir(output_dir.join(partial)).expect("block partial file");
    }
    let sources = FakeSources::default();
    let session = MediaSession::prepare_with_factory(all_sources(output_dir.clone()), &sources)
        .expect("record failed writers");
    assert_eq!(session.manifest.tracks.len(), 3);
    assert!(
        session
            .manifest
            .tracks
            .iter()
            .all(|track| track.status == TrackStatus::Failed)
    );
    assert!(
        session
            .manifest
            .tracks
            .iter()
            .all(|track| track.segments.is_empty())
    );
    for final_file in ["camera.webm", "microphone.wav", "system-audio.wav"] {
        assert!(!output_dir.join(final_file).exists());
    }
    session.stop().expect("stop");
}
