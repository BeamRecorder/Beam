#![cfg(test)]
#![allow(clippy::expect_used)]
use super::*;

struct FailedHalt;
impl AudioSource for FailedHalt {
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
        Err(AudioError::Backend("audio disconnect during stop".into()))
    }
}

fn empty_session(path: &std::path::Path) -> MediaSession {
    MediaSession::prepare(SessionConfig {
        screen: None,
        output_dir: path.to_owned(),
        camera: CameraSelection::Disabled,
        microphone: AudioSelection::Disabled,
        system_audio: AudioSelection::Disabled,
    })
    .expect("prepare")
}

#[test]
fn source_shutdown_failure_is_preserved_while_other_tracks_finish() {
    let directory = tempfile::tempdir().expect("tempdir");
    let mut session = empty_session(&directory.path().join("session"));
    session.microphone = Some(Box::new(FailedHalt));
    session.manifest.tracks.push(prepared_microphone());
    let mut camera = prepared_microphone();
    camera.kind = TrackKind::Camera;
    camera.status = TrackStatus::Paused;
    session.manifest.tracks.push(camera);
    session.start().expect("start");
    let manifest = session.stop().expect("stop still saves manifest");
    assert!(!manifest.completed);
    assert_eq!(manifest.tracks[0].status, TrackStatus::Interrupted);
    assert_eq!(
        manifest.tracks[0].termination_reason.as_deref(),
        Some("audio backend failed: audio disconnect during stop")
    );
    assert_eq!(manifest.tracks[1].status, TrackStatus::Completed);
    assert!(directory.path().join("session/manifest.json").is_file());
}

#[test]
fn failed_measurements_write_still_persists_an_incomplete_manifest_and_warning() {
    let directory = tempfile::tempdir().expect("tempdir");
    let output = directory.path().join("session");
    let mut session = empty_session(&output);
    session.start().expect("start");
    std::fs::create_dir(output.join("measurements.json")).expect("block measurements path");
    assert!(session.stop().is_err());
    let manifest: beam_media_manifest::SessionManifest = serde_json::from_slice(
        &std::fs::read(output.join("manifest.json")).expect("manifest after failure"),
    )
    .expect("manifest");
    assert!(!manifest.completed);
    assert!(
        manifest
            .warnings
            .iter()
            .any(|warning| warning.contains("measurements could not be saved"))
    );
    assert!(!output.join("manifest.partial.json").exists());
}

#[test]
fn manifest_finalization_failure_is_returned_after_sources_are_closed() {
    let directory = tempfile::tempdir().expect("tempdir");
    let output = directory.path().join("session");
    let session = empty_session(&output);
    std::fs::create_dir(output.join("manifest.json")).expect("block manifest path");
    assert!(session.stop().is_err());
    assert!(output.join("measurements.json").is_file());
    assert!(output.join("manifest.partial.json").is_file());
}
