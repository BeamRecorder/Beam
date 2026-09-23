#![allow(clippy::expect_used)]

#[cfg(target_os = "linux")]
use beam_media_manifest::TrackStatus;
use beam_media_session::{AudioSelection, MediaSession, SessionConfig};

#[test]
fn session_without_requested_sources_is_explicitly_empty() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let config = SessionConfig {
        screen: None,
        output_dir: temporary.path().join("session"),
        camera: beam_media_session::CameraSelection::Disabled,
        microphone: AudioSelection::Disabled,
        system_audio: AudioSelection::Disabled,
    };
    let mut session = MediaSession::prepare(config).expect("prepare");
    assert!(session.manifest().tracks.is_empty());
    session.start().expect("start");
    let manifest = session.stop().expect("stop");
    assert!(!manifest.completed);
    assert!(manifest.tracks.is_empty());
}

#[test]
fn timeline_handle_opens_and_closes_with_the_session() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let config = SessionConfig {
        screen: None,
        output_dir: temporary.path().join("session"),
        camera: beam_media_session::CameraSelection::Disabled,
        microphone: AudioSelection::Disabled,
        system_audio: AudioSelection::Disabled,
    };
    let mut session = MediaSession::prepare(config).expect("prepare");
    let timeline = session.timeline();
    assert_eq!(timeline.now_ns(), None);
    session.start().expect("start");
    assert!(timeline.now_ns().is_some());
    session.stop().expect("stop");
    assert_eq!(timeline.now_ns(), None);
}

#[test]
#[cfg(target_os = "linux")]
fn missing_camera_is_recorded_as_failed_without_fake_track_file() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let output = temporary.path().join("session");
    let config = SessionConfig {
        screen: None,
        output_dir: output.clone(),
        camera: beam_media_session::CameraSelection::Device(beam_camera::CameraRequest {
            device_id: "/dev/video999999".into(),
            width: 640,
            height: 480,
            fps: 30,
        }),
        microphone: AudioSelection::Disabled,
        system_audio: AudioSelection::Disabled,
    };
    let mut session = MediaSession::prepare(config).expect("prepare");
    session.start().expect("start");
    let manifest = session.stop().expect("stop");
    assert!(!manifest.completed);
    assert_eq!(manifest.tracks[0].status, TrackStatus::Failed);
    assert!(!output.join("camera.webm").exists());
    assert!(output.join("manifest.json").exists());
    assert!(output.join("measurements.json").exists());
}
