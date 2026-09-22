#![allow(clippy::expect_used)]

use super::*;

#[test]
fn source_read_errors_preserve_accepted_media_and_other_tracks() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    add_camera_with_error(
        &mut session,
        vec![frame(1, 10_000_000)],
        vec![],
        Some(CameraError::DeviceUnavailable("camera unplugged".into())),
    );
    add_audio_with_error(
        &mut session,
        TrackKind::Microphone,
        vec![packet(0.25)],
        vec![],
        Some(AudioError::DeviceUnavailable("microphone unplugged".into())),
    );
    add_audio(
        &mut session,
        TrackKind::SystemAudio,
        vec![packet(-0.25)],
        vec![],
    );
    session.start().expect("start");
    session.poll().expect("poll");
    let manifest = session.stop().expect("stop");
    assert!(!manifest.completed);
    assert_eq!(manifest.tracks[0].status, TrackStatus::Interrupted);
    assert_eq!(manifest.tracks[0].metrics.frames_encoded, 1);
    assert_eq!(manifest.tracks[1].status, TrackStatus::Interrupted);
    assert_eq!(manifest.tracks[1].metrics.samples_received, 480);
    assert_eq!(manifest.tracks[2].status, TrackStatus::Completed);
    assert!(
        manifest
            .tracks
            .iter()
            .all(|track| track.segments[0].complete)
    );
    for file in ["camera.webm", "microphone.wav", "system-audio.wav"] {
        assert!(temporary.path().join("session").join(file).is_file());
    }
}

struct HaltFailureAudio;

impl AudioSource for HaltFailureAudio {
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
        Err(AudioError::DeviceUnavailable(
            "microphone removed at stop".into(),
        ))
    }
}

#[test]
fn stop_drains_all_queued_sources_even_without_a_poll() {
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

    session.start().expect("start");
    let manifest = session.stop().expect("stop and drain");

    assert!(manifest.completed);
    assert_eq!(manifest.tracks[0].metrics.frames_encoded, 1);
    assert_eq!(manifest.tracks[1].metrics.samples_received, 480);
    assert_eq!(manifest.tracks[2].metrics.samples_received, 480);
    assert!(
        manifest
            .tracks
            .iter()
            .all(|track| track.segments[0].complete)
    );
}

#[test]
fn invalid_camera_buffer_fails_only_camera_and_preserves_audio() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    let mut invalid = frame(1, 10_000_000);
    invalid.data.data = Arc::from([16_u8, 128]);
    add_camera(&mut session, vec![invalid], vec![]);
    add_audio(
        &mut session,
        TrackKind::Microphone,
        vec![packet(0.25)],
        vec![],
    );

    session.start().expect("start");
    session.poll().expect("poll");
    let manifest = session.stop().expect("stop");

    assert!(!manifest.completed);
    assert_eq!(manifest.tracks[0].status, TrackStatus::Failed);
    assert_eq!(manifest.tracks[0].metrics.frames_received, 1);
    assert_eq!(manifest.tracks[0].metrics.frames_encoded, 0);
    assert!(manifest.tracks[0].termination_reason.is_some());
    assert_eq!(manifest.tracks[1].status, TrackStatus::Completed);
    assert_eq!(manifest.tracks[1].metrics.samples_received, 480);
}

#[test]
fn malformed_microphone_packet_fails_only_microphone_and_preserves_system_audio() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    let mut invalid = packet(0.25);
    invalid.packet.data.truncate(2);
    add_audio(&mut session, TrackKind::Microphone, vec![invalid], vec![]);
    add_audio(
        &mut session,
        TrackKind::SystemAudio,
        vec![packet(-0.25)],
        vec![],
    );

    session.start().expect("start");
    session.poll().expect("poll");
    let manifest = session.stop().expect("stop");

    assert!(!manifest.completed);
    assert_eq!(manifest.tracks[0].status, TrackStatus::Failed);
    assert_eq!(manifest.tracks[0].metrics.samples_received, 480);
    assert_eq!(manifest.tracks[1].status, TrackStatus::Completed);
    assert_eq!(manifest.tracks[1].metrics.samples_received, 480);
}

#[test]
fn failure_events_keep_failed_status_after_media_is_finalized() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    add_camera(
        &mut session,
        vec![frame(1, 10_000_000)],
        vec![CameraEvent::Failed("camera callback failed".into())],
    );
    add_audio(
        &mut session,
        TrackKind::Microphone,
        vec![packet(0.25)],
        vec![AudioEvent::Failed("microphone callback failed".into())],
    );
    add_audio(
        &mut session,
        TrackKind::SystemAudio,
        vec![packet(-0.25)],
        vec![],
    );

    session.start().expect("start");
    session.poll().expect("poll");
    let manifest = session.stop().expect("stop");

    assert!(!manifest.completed);
    for (track, reason) in [
        (&manifest.tracks[0], "camera callback failed"),
        (&manifest.tracks[1], "microphone callback failed"),
    ] {
        assert_eq!(track.status, TrackStatus::Failed);
        assert_eq!(track.termination_reason.as_deref(), Some(reason));
        assert!(track.segments[0].complete);
    }
    assert_eq!(manifest.tracks[2].status, TrackStatus::Completed);
}

#[test]
fn halt_failure_interrupts_only_its_track_after_other_sources_drain() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    add_audio(&mut session, TrackKind::Microphone, vec![], vec![]);
    session.microphone = Some(Box::new(HaltFailureAudio));
    add_audio(
        &mut session,
        TrackKind::SystemAudio,
        vec![packet(-0.25)],
        vec![],
    );

    session.start().expect("start");
    let manifest = session.stop().expect("stop");

    assert!(!manifest.completed);
    assert_eq!(manifest.tracks[0].status, TrackStatus::Interrupted);
    assert!(
        manifest.tracks[0]
            .termination_reason
            .as_deref()
            .is_some_and(|reason| reason.contains("removed at stop"))
    );
    assert_eq!(manifest.tracks[1].status, TrackStatus::Completed);
    assert_eq!(manifest.tracks[1].metrics.samples_received, 480);
}
