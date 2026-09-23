#![allow(clippy::expect_used)]

use beam_media_manifest::{TrackKind, TrackStatus};
use beam_media_session::{AudioSelection, MediaSession, SessionConfig, SessionError};

fn empty_sources(output_dir: std::path::PathBuf) -> SessionConfig {
    SessionConfig {
        screen: None,
        output_dir,
        camera: beam_media_session::CameraSelection::Disabled,
        microphone: AudioSelection::Disabled,
        system_audio: AudioSelection::Disabled,
    }
}

#[test]
fn empty_output_directory_is_rejected_before_any_files_are_created() {
    let result = MediaSession::prepare(empty_sources(std::path::PathBuf::new()));
    assert!(matches!(result, Err(SessionError::InvalidConfiguration(_))));
}

#[test]
fn existing_partial_manifest_is_not_overwritten() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let output = temporary.path().join("session");
    std::fs::create_dir(&output).expect("create session dir");
    let partial = output.join("manifest.partial.json");
    std::fs::write(&partial, b"unfinished earlier session").expect("old checkpoint");

    let result = MediaSession::prepare(empty_sources(output));
    assert!(matches!(result, Err(SessionError::InvalidConfiguration(_))));
    assert_eq!(
        std::fs::read(partial).expect("checkpoint"),
        b"unfinished earlier session"
    );
}

#[test]
fn start_twice_is_rejected_without_reopening_the_session_gate() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session =
        MediaSession::prepare(empty_sources(temporary.path().join("session"))).expect("prepare");
    session.start().expect("first start");
    let first_start = session.manifest().session_start_monotonic_ns;

    assert!(matches!(
        session.start(),
        Err(SessionError::InvalidConfiguration(_))
    ));
    assert_eq!(session.manifest().session_start_monotonic_ns, first_start);
    assert!(session.session_ns().is_some());
    session.stop().expect("stop");
}

#[test]
fn existing_manifest_is_never_overwritten_by_prepare() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let output = temporary.path().join("session");
    std::fs::create_dir(&output).expect("create session dir");
    std::fs::write(output.join("manifest.json"), b"previous session").expect("old manifest");
    let result = MediaSession::prepare(SessionConfig {
        screen: None,
        output_dir: output.clone(),
        camera: beam_media_session::CameraSelection::Disabled,
        microphone: AudioSelection::Disabled,
        system_audio: AudioSelection::Disabled,
    });
    assert!(matches!(result, Err(SessionError::InvalidConfiguration(_))));
    assert_eq!(
        std::fs::read(output.join("manifest.json")).expect("read"),
        b"previous session"
    );
}

#[test]
fn unavailable_microphone_is_a_failed_track_with_no_fake_wav() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let output = temporary.path().join("session");
    let session = MediaSession::prepare(SessionConfig {
        screen: None,
        output_dir: output.clone(),
        camera: beam_media_session::CameraSelection::Disabled,
        microphone: AudioSelection::Device("beam-no-such-microphone".into()),
        system_audio: AudioSelection::Disabled,
    })
    .expect("other tracks can still prepare");
    let track = &session.manifest().tracks[0];
    assert_eq!(track.kind, TrackKind::Microphone);
    assert_eq!(track.status, TrackStatus::Failed);
    assert!(track.termination_reason.is_some());
    assert!(!output.join("microphone.wav").exists());
}

#[test]
fn default_camera_failure_is_recorded_without_a_fake_video() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let output = temporary.path().join("session");
    let session = MediaSession::prepare(SessionConfig {
        screen: None,
        output_dir: output.clone(),
        camera: beam_media_session::CameraSelection::FirstAvailable {
            width: 0,
            height: 720,
            fps: 30,
        },
        microphone: AudioSelection::Disabled,
        system_audio: AudioSelection::Disabled,
    })
    .expect("prepare can record a failed default camera");
    let track = &session.manifest().tracks[0];
    assert_eq!(track.kind, TrackKind::Camera);
    assert_eq!(track.status, TrackStatus::Failed);
    assert!(track.termination_reason.is_some());
    assert!(!output.join("camera.webm").exists());
}

#[test]
fn host_project_identity_is_checkpointed_and_finalized() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let project_id = beam_media_manifest::ProjectId::new();
    let session = MediaSession::prepare_for_project(
        empty_sources(temporary.path().join("session")),
        project_id,
    )
    .expect("prepare");
    let checkpoint: beam_media_manifest::SessionManifest = serde_json::from_slice(
        &std::fs::read(temporary.path().join("session/manifest.partial.json")).expect("checkpoint"),
    )
    .expect("manifest");
    assert_eq!(checkpoint.project_id, project_id);
    assert_eq!(session.stop().expect("finalize").project_id, project_id);
}

#[test]
fn host_project_prepare_rejects_invalid_output() {
    let result = MediaSession::prepare_for_project(
        empty_sources(std::path::PathBuf::new()),
        beam_media_manifest::ProjectId::new(),
    );
    assert!(matches!(result, Err(SessionError::InvalidConfiguration(_))));
}

#[test]
fn host_project_prepare_preserves_existing_recording() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let output = temporary.path().join("session");
    let session = MediaSession::prepare_for_project(
        empty_sources(output.clone()),
        beam_media_manifest::ProjectId::new(),
    )
    .expect("prepare");
    let original = session.stop().expect("finalize");
    assert!(
        MediaSession::prepare_for_project(
            empty_sources(output.clone()),
            beam_media_manifest::ProjectId::new()
        )
        .is_err()
    );
    let saved: beam_media_manifest::SessionManifest =
        serde_json::from_slice(&std::fs::read(output.join("manifest.json")).expect("read"))
            .expect("manifest");
    assert_eq!(saved, original);
}
