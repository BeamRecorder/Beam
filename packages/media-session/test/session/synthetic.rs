#![cfg(test)]
#![allow(clippy::expect_used)]

use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
};

use beam_audio::{AudioError, AudioEvent, TimedAudioPacket};
use beam_camera::{CameraError, CameraEvent, CameraFormat, CameraFrame, PixelFormat};
use beam_media_core::{AudioPacket, LatestFrame, VideoFrame};
use beam_media_encode::{AudioConfig, QueueLimits, TrackWriter, VideoConfig};
use beam_media_manifest::{
    SegmentId, SegmentMetadata, SourceId, TrackFormat, TrackId, TrackKind, TrackMetadata,
    TrackMetrics, TrackStatus,
};

use crate::{AudioSelection, AudioSource, CameraSelection, CameraSource, SessionConfig};

use super::MediaSession;

const LIMITS: QueueLimits = QueueLimits {
    packets: 16,
    bytes: 1_048_576,
};
const CAMERA_FORMAT: CameraFormat = CameraFormat {
    width: 16,
    height: 16,
    fps: 30,
    pixel_format: PixelFormat::Yuyv,
    stride: 32,
};

struct SyntheticAudio {
    packets: Mutex<VecDeque<TimedAudioPacket>>,
    events: Mutex<VecDeque<AudioEvent>>,
    error: Mutex<Option<AudioError>>,
}

impl AudioSource for SyntheticAudio {
    fn format(&self) -> (u32, u16) {
        (48_000, 1)
    }

    fn queue_depth(&self) -> (usize, usize) {
        let packets = self.packets.lock().expect("audio packets");
        (packets.len(), packets.len() * 480 * 4)
    }

    fn try_packet(&self) -> Result<Option<TimedAudioPacket>, AudioError> {
        if let Some(packet) = self.packets.lock().expect("audio packets").pop_front() {
            return Ok(Some(packet));
        }
        match self.error.lock().expect("audio error").take() {
            Some(error) => Err(error),
            None => Ok(None),
        }
    }

    fn try_event(&self) -> Option<AudioEvent> {
        self.events.lock().expect("audio events").pop_front()
    }

    fn halt(&mut self) -> Result<(), AudioError> {
        Ok(())
    }
}

struct SyntheticCamera {
    frames: Mutex<VecDeque<VideoFrame<CameraFrame>>>,
    events: Mutex<VecDeque<CameraEvent>>,
    error: Mutex<Option<CameraError>>,
    latest: Arc<LatestFrame<VideoFrame<CameraFrame>>>,
}

impl CameraSource for SyntheticCamera {
    fn format(&self) -> CameraFormat {
        CAMERA_FORMAT
    }

    fn queue_depth(&self) -> (usize, usize) {
        let frames = self.frames.lock().expect("camera frames");
        (frames.len(), frames.len() * 16 * 16 * 2)
    }

    fn try_frame(&self) -> Result<Option<VideoFrame<CameraFrame>>, CameraError> {
        if let Some(frame) = self.frames.lock().expect("camera frames").pop_front() {
            return Ok(Some(frame));
        }
        match self.error.lock().expect("camera error").take() {
            Some(error) => Err(error),
            None => Ok(None),
        }
    }

    fn latest_preview(&self) -> Option<VideoFrame<CameraFrame>> {
        self.latest.take()
    }

    fn preview_handle(&self) -> Arc<LatestFrame<VideoFrame<CameraFrame>>> {
        self.latest.clone()
    }

    fn try_event(&self) -> Option<CameraEvent> {
        self.events.lock().expect("camera events").pop_front()
    }

    fn halt(&mut self) -> Result<(), CameraError> {
        Ok(())
    }
}

fn frame(sequence: u64, captured_ns: u64) -> VideoFrame<CameraFrame> {
    VideoFrame {
        captured_ns,
        width: CAMERA_FORMAT.width,
        height: CAMERA_FORMAT.height,
        data: CameraFrame {
            format: CAMERA_FORMAT,
            native_timestamp_ns: Some(1_000_000_000 + captured_ns),
            sequence,
            data: Arc::from([16_u8, 128, 16, 128].repeat(128)),
        },
    }
}

fn packet(value: f32) -> TimedAudioPacket {
    TimedAudioPacket {
        packet: AudioPacket {
            start_ns: 0,
            sample_rate: 48_000,
            channels: 1,
            frames: 480,
            data: vec![value; 480],
        },
        first_sample: 0,
        native_capture_ns: Some(1_000_000_000),
    }
}

fn track(kind: TrackKind, path: &str, format: TrackFormat) -> TrackMetadata {
    TrackMetadata {
        track_id: TrackId::new(),
        kind,
        source_id: Some(SourceId::new(format!("synthetic-{kind:?}")).expect("source ID")),
        format,
        segments: vec![SegmentMetadata {
            segment_id: SegmentId::new(),
            path: path.into(),
            start_ns: 0,
            end_ns: None,
            complete: false,
        }],
        metrics: TrackMetrics::default(),
        status: TrackStatus::Preparing,
        termination_reason: None,
    }
}

fn session(temporary: &tempfile::TempDir) -> MediaSession {
    MediaSession::prepare(SessionConfig {
        output_dir: temporary.path().join("session"),
        camera: CameraSelection::Disabled,
        microphone: AudioSelection::Disabled,
        system_audio: AudioSelection::Disabled,
    })
    .expect("prepare")
}

fn add_camera(
    session: &mut MediaSession,
    frames: Vec<VideoFrame<CameraFrame>>,
    events: Vec<CameraEvent>,
) {
    add_camera_with_error(session, frames, events, None);
}

fn add_camera_with_error(
    session: &mut MediaSession,
    frames: Vec<VideoFrame<CameraFrame>>,
    events: Vec<CameraEvent>,
    error: Option<CameraError>,
) {
    let latest = Arc::new(LatestFrame::new());
    for frame in &frames {
        latest.publish(frame.clone());
    }
    session.camera = Some(Box::new(SyntheticCamera {
        frames: Mutex::new(frames.into()),
        events: Mutex::new(events.into()),
        error: Mutex::new(error),
        latest,
    }));
    session.camera_writer = Some(
        TrackWriter::open_video(
            &session.layout.root().join("camera.webm"),
            VideoConfig {
                width: 16,
                height: 16,
                fps: 30,
            },
            LIMITS,
        )
        .expect("camera writer"),
    );
    session.manifest.tracks.push(track(
        TrackKind::Camera,
        "camera.webm",
        TrackFormat::Video {
            codec: "vp8".into(),
            width: 16,
            height: 16,
            nominal_fps: 30,
        },
    ));
}

fn add_audio(
    session: &mut MediaSession,
    kind: TrackKind,
    packets: Vec<TimedAudioPacket>,
    events: Vec<AudioEvent>,
) {
    add_audio_with_error(session, kind, packets, events, None);
}

fn add_audio_with_error(
    session: &mut MediaSession,
    kind: TrackKind,
    packets: Vec<TimedAudioPacket>,
    events: Vec<AudioEvent>,
    error: Option<AudioError>,
) {
    let source: Box<dyn AudioSource> = Box::new(SyntheticAudio {
        packets: Mutex::new(packets.into()),
        events: Mutex::new(events.into()),
        error: Mutex::new(error),
    });
    let path = match kind {
        TrackKind::Microphone => {
            session.microphone = Some(source);
            "microphone.wav"
        }
        TrackKind::SystemAudio => {
            session.system_audio = Some(source);
            "system-audio.wav"
        }
        _ => unreachable!("only audio tracks are installed"),
    };
    let writer = TrackWriter::open_audio(
        &session.layout.root().join(path),
        AudioConfig {
            sample_rate: 48_000,
            channels: 1,
        },
        LIMITS,
    )
    .expect("audio writer");
    if kind == TrackKind::Microphone {
        session.microphone_writer = Some(writer);
    } else {
        session.system_writer = Some(writer);
    }
    session.manifest.tracks.push(track(
        kind,
        path,
        TrackFormat::Audio {
            sample_format: "F32LE".into(),
            sample_rate: 48_000,
            channels: 1,
        },
    ));
}

#[test]
fn synthetic_three_track_session_keeps_preview_independent_and_finishes_all_files() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    add_camera(
        &mut session,
        vec![frame(1, 10_000_000), frame(2, 43_333_333)],
        vec![CameraEvent::Started],
    );
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
    assert_eq!(
        session
            .camera_preview_frame()
            .expect("preview")
            .data
            .sequence,
        2
    );
    session.start().expect("start");
    session.poll().expect("poll");
    let manifest = session.stop().expect("stop");
    assert!(manifest.completed);
    assert!(
        manifest
            .tracks
            .iter()
            .all(|track| track.status == TrackStatus::Completed)
    );
    assert_eq!(manifest.tracks[0].metrics.frames_encoded, 2);
    assert_eq!(manifest.tracks[1].metrics.samples_received, 480);
    assert_eq!(manifest.tracks[2].metrics.samples_received, 480);
    for file in ["camera.webm", "microphone.wav", "system-audio.wav"] {
        assert!(temporary.path().join("session").join(file).is_file());
    }
    assert_ne!(
        std::fs::read(temporary.path().join("session/microphone.wav")).expect("mic WAV"),
        std::fs::read(temporary.path().join("session/system-audio.wav")).expect("system WAV")
    );
}

#[test]
fn disconnected_microphone_does_not_prevent_camera_or_system_audio_completion() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    add_camera(&mut session, vec![frame(1, 10_000_000)], vec![]);
    add_audio(
        &mut session,
        TrackKind::Microphone,
        vec![],
        vec![AudioEvent::Disconnected("microphone unplugged".into())],
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
    assert_eq!(manifest.tracks[0].status, TrackStatus::Completed);
    assert_eq!(manifest.tracks[1].status, TrackStatus::Interrupted);
    assert_eq!(manifest.tracks[2].status, TrackStatus::Completed);
    assert!(
        manifest.tracks[1]
            .termination_reason
            .as_deref()
            .is_some_and(|reason| reason.contains("unplugged"))
    );
}

#[test]
fn source_drops_and_output_change_keep_per_track_metrics_and_status() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    add_camera(
        &mut session,
        vec![frame(1, 10_000_000)],
        vec![CameraEvent::Dropped { sequence: 2 }],
    );
    add_audio(
        &mut session,
        TrackKind::Microphone,
        vec![packet(0.25)],
        vec![AudioEvent::Dropped {
            first_sample: 480,
            frames: 480,
        }],
    );
    add_audio(
        &mut session,
        TrackKind::SystemAudio,
        vec![],
        vec![AudioEvent::DeviceChanged("output switched".into())],
    );
    session.start().expect("start");
    session.poll().expect("poll");
    let measurements = session.measurements();
    assert_eq!(measurements.camera.dropped, 1);
    assert_eq!(measurements.microphone.dropped, 480);
    let manifest = session.stop().expect("stop");
    assert!(!manifest.completed);
    assert_eq!(manifest.tracks[0].status, TrackStatus::Completed);
    assert_eq!(manifest.tracks[0].metrics.frames_dropped, 1);
    assert_eq!(manifest.tracks[1].status, TrackStatus::Completed);
    assert_eq!(manifest.tracks[1].metrics.samples_dropped, 480);
    assert_eq!(manifest.tracks[2].status, TrackStatus::Interrupted);
    assert_eq!(
        manifest.tracks[2].termination_reason.as_deref(),
        Some("output switched")
    );
}

#[test]
fn native_clock_discontinuities_invalidate_only_their_own_tracks() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = session(&temporary);
    add_camera(
        &mut session,
        vec![frame(1, 10_000_000)],
        vec![CameraEvent::ClockDiscontinuity { sequence: 1 }],
    );
    add_audio(
        &mut session,
        TrackKind::Microphone,
        vec![packet(0.25)],
        vec![AudioEvent::ClockDiscontinuity { first_sample: 0 }],
    );
    add_audio(
        &mut session,
        TrackKind::SystemAudio,
        vec![packet(-0.25)],
        vec![],
    );
    session.start().expect("start");
    session.poll().expect("poll");
    assert!(session.measurements().camera.native_clock_discontinuous);
    assert!(session.measurements().microphone.native_clock_discontinuous);
    assert!(
        !session
            .measurements()
            .system_audio
            .native_clock_discontinuous
    );
    let manifest = session.stop().expect("stop");
    assert_eq!(manifest.tracks[0].metrics.interruptions, 1);
    assert_eq!(manifest.tracks[1].metrics.interruptions, 1);
    assert_eq!(manifest.tracks[2].metrics.interruptions, 0);
}

#[test]
fn forced_interruption_keeps_finalized_media_but_no_completed_tracks() {
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
    session.poll().expect("poll");
    let manifest = session.interrupt("forced stop").expect("interrupt");
    assert!(!manifest.completed);
    assert!(
        manifest
            .tracks
            .iter()
            .all(|track| track.status == TrackStatus::Interrupted)
    );
    assert!(manifest.tracks.iter().all(|track| {
        track.termination_reason.as_deref() == Some("forced stop") && track.segments[0].complete
    }));
    for file in ["camera.webm", "microphone.wav", "system-audio.wav"] {
        assert!(temporary.path().join("session").join(file).is_file());
    }
}

#[path = "synthetic_failure.rs"]
mod failure_checks;

#[path = "synthetic_edges.rs"]
mod edge_checks;
