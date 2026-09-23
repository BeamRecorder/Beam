#![allow(clippy::expect_used)]
use super::*;
use beam_screen::{
    CaptureError, ScreenPreview, ScreenSource,
    screen::{
        CursorSampleState, FrameTimestamp, OwnedScreenSample, OwnedVideoFrame,
        PixelFormat as ScreenPixelFormat, TimestampSource, VideoFormat,
    },
};

pub(super) struct SyntheticScreen {
    pub(super) frames: Arc<Mutex<VecDeque<OwnedScreenSample>>>,
    error: bool,
    preview: ScreenPreview,
}
impl ScreenSource for SyntheticScreen {
    fn format(&self) -> VideoFormat {
        VideoFormat {
            width: 16,
            height: 16,
            stride: 64,
            pixel_format: ScreenPixelFormat::Bgra8,
        }
    }
    fn source_id(&self) -> &str {
        "synthetic-screen"
    }
    fn queue_depth(&self) -> (usize, usize) {
        let len = self.frames.lock().expect("frames").len();
        (len, len * 1024)
    }
    fn try_frame(&self) -> Result<Option<OwnedScreenSample>, CaptureError> {
        if let Some(frame) = self.frames.lock().expect("frames").pop_front() {
            return Ok(Some(frame));
        }
        if self.error {
            return Err(CaptureError::Backend("screen disconnected".into()));
        }
        Ok(None)
    }
    fn try_cursor(&self) -> Option<(u64, CursorSampleState)> {
        None
    }
    fn preview_handle(&self) -> ScreenPreview {
        self.preview.clone()
    }
    fn dropped_frames(&self) -> u64 {
        0
    }
    fn halt(&mut self) -> Result<(), CaptureError> {
        Ok(())
    }
}
pub(super) fn screen_frame(pts: u64) -> OwnedScreenSample {
    OwnedScreenSample {
        frame: OwnedVideoFrame {
            width: 16,
            height: 16,
            stride: 64,
            pixel_format: ScreenPixelFormat::Bgra8,
            pixels: Arc::from([0, 0, 255, 255].repeat(256)),
        },
        timestamp: FrameTimestamp {
            session_ns: pts,
            native_pts_ns: Some(1_000_000_000 + pts),
            source: TimestampSource::NativePresentation,
        },
        sequence: pts,
        cursor: CursorSampleState::Unknown,
    }
}
pub(super) fn add_screen(
    session: &mut MediaSession,
    frames: Vec<OwnedScreenSample>,
    error: bool,
) -> Arc<Mutex<VecDeque<OwnedScreenSample>>> {
    let queue = Arc::new(Mutex::new(VecDeque::from(frames)));
    let preview = Arc::new(LatestFrame::new());
    if let Some(frame) = queue.lock().expect("frames").back() {
        preview.publish(frame.clone());
    }
    session.screen = Some(Box::new(SyntheticScreen {
        frames: queue.clone(),
        error,
        preview,
    }));
    session.screen_fps = 30;
    session.screen_writer = Some(
        TrackWriter::open_video(
            &session.layout.root().join("screen.webm"),
            VideoConfig {
                width: 16,
                height: 16,
                fps: 30,
            },
            LIMITS,
        )
        .expect("screen writer"),
    );
    session.manifest.tracks.push(track(
        TrackKind::Screen,
        "screen.webm",
        TrackFormat::Video {
            codec: "vp8".into(),
            width: 16,
            height: 16,
            nominal_fps: 30,
        },
    ));
    queue
}
#[test]
fn four_independent_tracks_finalize_with_one_gate() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    add_screen(
        &mut session,
        vec![screen_frame(0), screen_frame(33_333_333)],
        false,
    );
    add_camera(&mut session, vec![frame(1, 0)], vec![]);
    add_audio(
        &mut session,
        TrackKind::Microphone,
        vec![packet(0.25)],
        vec![],
    );
    add_audio(
        &mut session,
        TrackKind::SystemAudio,
        vec![packet(-0.5)],
        vec![],
    );
    assert!(
        session
            .screen_preview_source()
            .expect("preview")
            .take()
            .is_some()
    );
    session.start().expect("start");
    session.poll().expect("poll");
    let manifest = session.stop().expect("stop");
    assert!(manifest.completed);
    assert_eq!(manifest.tracks.len(), 4);
    assert_eq!(manifest.tracks[0].metrics.frames_encoded, 2);
    for track in &manifest.tracks {
        assert_eq!(track.status, TrackStatus::Completed);
        assert!(
            temporary
                .path()
                .join("session")
                .join(&track.segments[0].path)
                .metadata()
                .expect("media")
                .len()
                > 0
        );
    }
    let mic = std::fs::read(temporary.path().join("session/microphone.wav")).expect("mic");
    let system = std::fs::read(temporary.path().join("session/system-audio.wav")).expect("system");
    assert_ne!(mic, system);
}
#[test]
fn screen_disconnect_does_not_fail_other_tracks() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    add_screen(&mut session, vec![screen_frame(0)], true);
    add_camera(&mut session, vec![frame(1, 0)], vec![]);
    session.start().expect("start");
    session.poll().expect("poll");
    let manifest = session.stop().expect("stop");
    assert!(!manifest.completed);
    assert_eq!(manifest.tracks[0].status, TrackStatus::Failed);
    assert_eq!(manifest.tracks[1].status, TrackStatus::Completed);
}
#[test]
fn invalid_screen_bytes_fail_only_screen() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    let mut invalid = screen_frame(0);
    invalid.frame.pixels = Arc::from([0u8]);
    add_screen(&mut session, vec![invalid], false);
    add_audio(
        &mut session,
        TrackKind::Microphone,
        vec![packet(0.25)],
        vec![],
    );
    session.start().expect("start");
    session.poll().expect("poll");
    let manifest = session.stop().expect("stop");
    assert_eq!(manifest.tracks[0].status, TrackStatus::Failed);
    assert_eq!(manifest.tracks[1].status, TrackStatus::Completed);
}
