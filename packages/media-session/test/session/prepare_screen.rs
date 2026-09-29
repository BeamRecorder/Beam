#![allow(clippy::expect_used)]
use super::*;
use beam_screen::{
    CaptureError, ScreenPreview, ScreenRequest, ScreenSource,
    screen::{CursorSampleState, OwnedScreenSample, PixelFormat as ScreenPixelFormat, VideoFormat},
};
pub(super) struct SilentScreen;
impl ScreenSource for SilentScreen {
    fn format(&self) -> VideoFormat {
        VideoFormat {
            width: 16,
            height: 16,
            stride: 64,
            pixel_format: ScreenPixelFormat::Bgra8,
        }
    }
    fn source_id(&self) -> &str {
        "screen-1"
    }
    fn queue_depth(&self) -> (usize, usize) {
        (0, 0)
    }
    fn try_frame(&self) -> Result<Option<OwnedScreenSample>, CaptureError> {
        Ok(None)
    }
    fn try_cursor(&self) -> Option<(u64, CursorSampleState)> {
        None
    }
    fn preview_handle(&self) -> ScreenPreview {
        Arc::new(LatestFrame::new())
    }
    fn dropped_frames(&self) -> u64 {
        3
    }
    fn halt(&mut self) -> Result<(), CaptureError> {
        Ok(())
    }
}
fn request(cursor: bool) -> ScreenRequest {
    ScreenRequest {
        selection: beam_screen::model::ScreenSelection::Portal {
            kind: beam_screen::model::PortalSourceKind::Monitor,
            restore_token: None,
        },
        region: None,
        cursor: if cursor {
            beam_screen::model::CursorSelection::Separate {
                capture_clicks: false,
                capture_shortcuts: false,
                capture_shape: false,
            }
        } else {
            beam_screen::model::CursorSelection::Disabled
        },
        fps: 30,
        excluded_window_handles: vec![],
    }
}
#[test]
fn screen_preparation_owns_its_writer_and_cursor_before_other_devices() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let sources = FakeSources::default();
    let mut config = all_sources(temporary.path().join("session"));
    config.screen = Some(request(true));
    let mut session = MediaSession::prepare_with_factory(config, &sources).expect("prepare four");
    assert_eq!(
        *sources.calls.lock().expect("calls"),
        ["screen-1", "camera-1", "microphone-1", "output-1"]
    );
    assert!(session.screen_preview_source().is_some());
    assert!(
        session
            .manifest
            .tracks
            .iter()
            .any(|track| track.kind == TrackKind::Screen && track.status == TrackStatus::Preparing)
    );
    session.start().expect("start");
    session.poll().expect("poll");
    assert_eq!(session.measurements.screen.dropped, 3);
    let manifest = session.stop().expect("stop");
    assert!(
        manifest
            .tracks
            .iter()
            .any(|track| track.kind == TrackKind::Cursor)
    );
}
#[test]
fn portal_cancel_aborts_before_opening_camera_or_audio() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let sources = FakeSources {
        screen_mode: "cancel",
        ..Default::default()
    };
    let mut config = all_sources(temporary.path().join("session"));
    config.screen = Some(request(false));
    assert!(matches!(
        MediaSession::prepare_with_factory(config, &sources),
        Err(crate::SessionError::Screen(CaptureError::Cancelled))
    ));
    assert_eq!(*sources.calls.lock().expect("calls"), ["screen-1"]);
}
#[test]
fn screen_loss_or_writer_failure_does_not_disable_other_tracks() {
    for mode in ["fail", "writer"] {
        let temporary = tempfile::tempdir().expect("tempdir");
        let output = temporary.path().join("session");
        if mode == "writer" {
            std::fs::create_dir_all(output.join("screen.webm.part")).expect("block writer");
        }
        let sources = FakeSources {
            screen_mode: mode,
            ..Default::default()
        };
        let mut config = all_sources(output);
        config.screen = Some(request(false));
        let session =
            MediaSession::prepare_with_factory(config, &sources).expect("partial prepare");
        assert!(session.manifest.tracks.iter().any(|track|track.kind==TrackKind::Screen && track.status==TrackStatus::Failed));
        assert!(
            session
                .manifest
                .tracks
                .iter()
                .any(|track| track.kind == TrackKind::Camera
                    && track.status == TrackStatus::Preparing)
        );
        session.stop().expect("stop");
    }
}

#[test]
fn successful_capture_persists_its_actual_cursor_composition_mode() {
    for (selection, expected) in [
        (
            beam_screen::model::CursorSelection::Disabled,
            beam_media_manifest::CursorMode::Absent,
        ),
        (
            beam_screen::model::CursorSelection::Embedded,
            beam_media_manifest::CursorMode::BakedIn,
        ),
        (
            beam_screen::model::CursorSelection::Separate {
                capture_clicks: false,
                capture_shortcuts: false,
                capture_shape: false,
            },
            beam_media_manifest::CursorMode::Separated,
        ),
    ] {
        let temporary = tempfile::tempdir().expect("tempdir");
        let sources = FakeSources::default();
        let mut config = all_sources(temporary.path().join("session"));
        let mut screen = request(false);
        screen.cursor = selection;
        config.screen = Some(screen);
        let session = MediaSession::prepare_with_factory(config, &sources).expect("prepare");
        assert_eq!(session.manifest.cursor_mode, expected);
        session.stop().expect("stop");
    }
}
#[test]
fn failed_screen_open_does_not_publish_an_unproven_cursor_mode() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let sources = FakeSources {
        screen_mode: "fail",
        ..Default::default()
    };
    let mut config = all_sources(temporary.path().join("session"));
    config.screen = Some(request(true));
    let session = MediaSession::prepare_with_factory(config, &sources).expect("failure retained");
    assert_eq!(
        session.manifest.cursor_mode,
        beam_media_manifest::CursorMode::Unknown
    );
    session.stop().expect("stop");
}
