#![allow(clippy::expect_used)]

use beam_media_session::{AudioSelection, MediaSession, SessionConfig, SessionError};

#[test]
fn live_duration_advances_before_checkpoint_and_excludes_pauses() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = MediaSession::prepare(SessionConfig {
        screen: None,
        output_dir: temporary.path().join("session"),
        camera: beam_media_session::CameraSelection::Disabled,
        microphone: AudioSelection::Disabled,
        system_audio: AudioSelection::Disabled,
    })
    .expect("prepare");
    session.start().expect("start");
    std::thread::sleep(std::time::Duration::from_millis(30));
    session.poll().expect("live clock");
    let first = session.manifest().duration_ns;
    assert!(first >= 20_000_000 && first < 1_000_000_000, "{first}");
    session.pause().expect("pause");
    let paused = session.manifest().duration_ns;
    std::thread::sleep(std::time::Duration::from_millis(50));
    session.poll().expect("paused poll");
    assert_eq!(session.manifest().duration_ns, paused);
    session.resume().expect("resume");
    session.poll().expect("resumed clock");
    assert!(session.manifest().duration_ns - paused < 40_000_000);
    std::thread::sleep(std::time::Duration::from_millis(20));
    session.poll().expect("resumed clock advances");
    assert!(session.manifest().duration_ns >= paused + 15_000_000);
    session.stop().expect("finalize");
}

#[test]
fn failed_periodic_checkpoint_still_publishes_the_interruption() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let output = temporary.path().join("session");
    let mut session = MediaSession::prepare(SessionConfig {
        screen: None,
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
        screen: None,
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
