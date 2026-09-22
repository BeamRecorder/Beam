#![allow(clippy::expect_used)]

use beam_media_session::{AudioSelection, MediaSession, SessionConfig};

#[test]
fn stopping_before_start_keeps_the_session_incomplete_and_writes_a_manifest() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let output = temporary.path().join("session");
    let session = MediaSession::prepare(SessionConfig {
        output_dir: output.clone(),
        camera: beam_media_session::CameraSelection::Disabled,
        microphone: AudioSelection::Disabled,
        system_audio: AudioSelection::Disabled,
    })
    .expect("prepare");
    let manifest = session.stop().expect("stop");
    assert!(!manifest.completed);
    assert_eq!(manifest.duration_ns, 0);
    assert!(output.join("manifest.json").is_file());
    assert!(output.join("measurements.json").is_file());
    assert!(!output.join("manifest.partial.json").exists());
}
