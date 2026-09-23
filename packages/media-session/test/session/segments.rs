#![allow(clippy::expect_used)]
use super::screen_checks::{add_screen, screen_frame};
use super::*;
#[test]
fn pause_resume_publishes_separate_contiguous_screen_segments() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    let frames = add_screen(&mut session, vec![screen_frame(0)], false);
    session.start().expect("start");
    session.poll().expect("poll");
    session.pause().expect("pause");
    let boundary = session.manifest.duration_ns;
    assert!(session.session_ns().is_none());
    assert_eq!(session.manifest.tracks[0].status, TrackStatus::Paused);
    session.resume().expect("resume");
    frames
        .lock()
        .expect("frames")
        .push_back(screen_frame(boundary + 1));
    session.poll().expect("poll");
    let manifest = session.stop().expect("stop");
    assert!(manifest.completed);
    let segments = &manifest.tracks[0].segments;
    assert_eq!(segments.len(), 2);
    assert_eq!(segments[0].end_ns, Some(segments[1].start_ns));
    assert_eq!(segments[1].path, "screen-1.webm");
    assert!(segments.iter().all(|segment| segment.complete));
}
#[test]
fn stop_during_pause_completes_existing_media_without_empty_segment() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    add_screen(&mut session, vec![screen_frame(0)], false);
    session.start().expect("start");
    session.pause().expect("pause");
    let boundary = session.manifest.duration_ns;
    let manifest = session.stop().expect("stop");
    assert_eq!(manifest.duration_ns, boundary);
    assert_eq!(manifest.tracks[0].status, TrackStatus::Completed);
    assert_eq!(manifest.tracks[0].segments.len(), 1);
    assert!(manifest.completed);
}
#[test]
fn illegal_pause_and_resume_do_not_change_recording() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    add_screen(&mut session, vec![screen_frame(0)], false);
    assert!(session.pause().is_err());
    assert!(session.resume().is_err());
    session.start().expect("start");
    assert!(session.resume().is_err());
    session.pause().expect("pause");
    assert!(session.pause().is_err());
    assert!(session.stop().expect("stop").completed);
}

#[test]
fn meters_measure_the_recorded_packets_and_clear_during_pause() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    add_audio(
        &mut session,
        TrackKind::Microphone,
        vec![packet(-0.5)],
        vec![],
    );
    add_audio(
        &mut session,
        TrackKind::SystemAudio,
        vec![packet(0.25)],
        vec![],
    );
    session.start().expect("start");
    session.poll().expect("poll");
    assert_eq!(
        session.audio_levels().microphone.expect("microphone").peak,
        0.5
    );
    assert_eq!(
        session.audio_levels().system_audio.expect("system").rms,
        0.25
    );
    session.pause().expect("pause");
    assert!(session.audio_levels().microphone.is_none());
    session.stop().expect("stop");
}
