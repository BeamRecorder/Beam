#![allow(clippy::expect_used)]

use beam_media_session::{AudioSelection, MediaSession, SessionConfig, SessionError};

#[test]
fn failed_periodic_checkpoint_still_publishes_the_interruption() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let output = temporary.path().join("session");
    let mut session = MediaSession::prepare(SessionConfig {
        output_dir: output.clone(),
        camera: beam_media_session::CameraSelection::Disabled,
        microphone: AudioSelection::Disabled,
        system_audio: AudioSelection::Disabled,
    })
    .expect("prepare");
    session.start().expect("start");
    std::fs::remove_file(output.join("manifest.partial.json")).expect("remove checkpoint");
    std::fs::create_dir(output.join("manifest.partial.json")).expect("block checkpoint");
    std::thread::sleep(std::time::Duration::from_millis(1_100));

    let error = session.poll().expect_err("checkpoint must fail");
    assert!(error.to_string().contains("manifest.partial.json"));
    let manifest = session
        .interrupt(&format!("periodic checkpoint failed: {error}"))
        .expect("finalize interruption");
    assert!(!manifest.completed);
    assert!(
        manifest
            .warnings
            .iter()
            .any(|warning| warning.contains("checkpoint failed"))
    );
    assert!(output.join("manifest.json").is_file());
    assert!(output.join("measurements.json").is_file());
    assert!(output.join("manifest.partial.json").is_dir());
}

#[test]
fn polling_requires_a_started_session_and_does_not_create_media() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let output = temporary.path().join("session");
    let mut session = MediaSession::prepare(SessionConfig {
        output_dir: output.clone(),
        camera: beam_media_session::CameraSelection::Disabled,
        microphone: AudioSelection::Disabled,
        system_audio: AudioSelection::Disabled,
    })
    .expect("prepare");
    assert!(matches!(
        session.poll(),
        Err(SessionError::InvalidConfiguration(_))
    ));
    session.start().expect("start");
    session.poll().expect("poll empty session");
    session.stop().expect("finalize");
    assert!(!output.join("camera.webm").exists());
    assert!(!output.join("microphone.wav").exists());
    assert!(!output.join("system-audio.wav").exists());
}
