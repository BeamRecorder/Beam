#![allow(clippy::expect_used)]

use beam_media_session::{AudioSelection, MediaSession, ProcessSample, SessionConfig};

#[test]
fn public_session_api_persists_process_measurements() {
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
    session.record_process_sample(ProcessSample {
        session_ns: 123,
        process_count: 2,
        rss_bytes: 4096,
        cpu_percent_x100: 125,
        gpu_memory_bytes: None,
        preview_frames_uploaded: Some(3),
    });
    session.stop().expect("stop");
    let saved: serde_json::Value =
        serde_json::from_slice(&std::fs::read(output.join("measurements.json")).expect("read"))
            .expect("JSON");
    assert_eq!(saved["processSamples"][0]["sessionNs"], 123);
    assert_eq!(saved["processSamples"][0]["rssBytes"], 4096);
    assert_eq!(saved["processSamples"][0]["previewFramesUploaded"], 3);
}
