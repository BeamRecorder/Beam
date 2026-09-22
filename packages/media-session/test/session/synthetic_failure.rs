#![allow(clippy::expect_used)]

use super::*;

#[test]
fn microphone_publish_failure_keeps_camera_and_system_tracks() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    add_camera(&mut session, vec![frame(1, 10_000_000)], vec![]);
    add_audio(
        &mut session,
        TrackKind::Microphone,
        vec![packet(0.25)],
        vec![],
    );
    add_audio(
        &mut session,
        TrackKind::SystemAudio,
        vec![packet(-0.25)],
        vec![],
    );

    let output = temporary.path().join("session");
    std::fs::create_dir(output.join("microphone.wav")).expect("block microphone publish");
    session.start().expect("start");
    session.poll().expect("poll");
    let manifest = session.stop().expect("stop and finalize manifest");

    assert!(!manifest.completed);
    assert_eq!(manifest.tracks[0].status, TrackStatus::Completed);
    assert_eq!(manifest.tracks[1].status, TrackStatus::Failed);
    assert_eq!(manifest.tracks[2].status, TrackStatus::Completed);
    assert!(
        manifest.tracks[1]
            .termination_reason
            .as_deref()
            .is_some_and(|reason| reason.contains("microphone.wav"))
    );
    assert!(output.join("camera.webm").is_file());
    assert!(output.join("microphone.wav.part").is_file());
    assert!(output.join("system-audio.wav").is_file());
    assert!(output.join("manifest.json").is_file());
}

#[test]
fn measurements_publish_failure_keeps_completed_media_and_finalizes_incomplete_manifest() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    add_audio(
        &mut session,
        TrackKind::Microphone,
        vec![packet(0.25)],
        vec![],
    );
    let output = temporary.path().join("session");
    std::fs::create_dir(output.join("measurements.json")).expect("block measurements publish");

    session.start().expect("start");
    session.poll().expect("poll");
    let error = session
        .stop()
        .expect_err("measurements must report failure");
    assert!(error.to_string().contains("measurements.json"));

    let manifest: beam_media_manifest::SessionManifest = serde_json::from_slice(
        &std::fs::read(output.join("manifest.json")).expect("final manifest"),
    )
    .expect("manifest JSON");
    assert!(!manifest.completed);
    assert_eq!(manifest.tracks.len(), 1);
    assert_eq!(manifest.tracks[0].status, TrackStatus::Completed);
    assert!(manifest.tracks[0].segments[0].complete);
    assert!(
        manifest
            .warnings
            .iter()
            .any(|warning| warning.contains("measurements.json"))
    );
    assert!(output.join("microphone.wav").is_file());
    assert!(!output.join("measurements.json.tmp").exists());
}

#[test]
fn manifest_publish_failure_keeps_partial_checkpoint_and_completed_media() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    add_audio(
        &mut session,
        TrackKind::Microphone,
        vec![packet(0.25)],
        vec![],
    );
    let output = temporary.path().join("session");
    std::fs::create_dir(output.join("manifest.json")).expect("block final manifest");

    session.start().expect("start");
    session.poll().expect("poll");
    let error = session.stop().expect_err("manifest must report failure");
    assert!(error.to_string().contains("manifest.json"));
    assert!(output.join("manifest.partial.json").is_file());
    assert!(output.join("measurements.json").is_file());
    assert!(output.join("microphone.wav").is_file());
    assert!(!output.join("manifest.json.tmp").exists());
}
