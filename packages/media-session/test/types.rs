#![allow(clippy::expect_used)]

use beam_media_session::{AudioSelection, MediaSession, SessionConfig};

#[test]
fn cloned_timeline_handle_follows_the_session_gate() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = MediaSession::prepare(SessionConfig {
        output_dir: temporary.path().join("session"),
        camera: beam_media_session::CameraSelection::Disabled,
        microphone: AudioSelection::Disabled,
        system_audio: AudioSelection::Disabled,
    })
    .expect("prepare");
    let timeline = session.timeline().clone();
    assert_eq!(timeline.now_ns(), None);
    session.start().expect("start");
    assert!(timeline.now_ns().is_some());
    session.stop().expect("stop");
    assert_eq!(timeline.now_ns(), None);
}
