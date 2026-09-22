#![cfg(test)]
#![allow(clippy::expect_used)]

use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};

use beam_audio::{AudioError, AudioEvent, TimedAudioPacket};
use beam_media_core::AudioPacket;
use beam_media_encode::{AudioConfig, QueueLimits, TrackWriter};
use beam_media_manifest::{
    SegmentId, SegmentMetadata, SourceId, TrackFormat, TrackId, TrackKind, TrackMetadata,
    TrackMetrics, TrackStatus,
};

use crate::{AudioSelection, AudioSource, CameraSelection, MediaSession, SessionConfig};

struct StalledAudio {
    reads: Arc<AtomicUsize>,
}

struct OnePacketAudio {
    packet: Mutex<Option<TimedAudioPacket>>,
}

impl AudioSource for OnePacketAudio {
    fn format(&self) -> (u32, u16) {
        (48_000, 1)
    }

    fn queue_depth(&self) -> (usize, usize) {
        let queued = self.packet.lock().expect("audio packet").is_some();
        (usize::from(queued), usize::from(queued) * 1_920)
    }

    fn try_packet(&self) -> Result<Option<TimedAudioPacket>, AudioError> {
        Ok(self.packet.lock().expect("audio packet").take())
    }

    fn try_event(&self) -> Option<AudioEvent> {
        None
    }

    fn halt(&mut self) -> Result<(), AudioError> {
        Ok(())
    }
}

impl AudioSource for StalledAudio {
    fn format(&self) -> (u32, u16) {
        (48_000, 1)
    }

    fn queue_depth(&self) -> (usize, usize) {
        (1, 1_920)
    }

    fn try_packet(&self) -> Result<Option<TimedAudioPacket>, AudioError> {
        self.reads.fetch_add(1, Ordering::Relaxed);
        Ok(None)
    }

    fn try_event(&self) -> Option<AudioEvent> {
        None
    }

    fn halt(&mut self) -> Result<(), AudioError> {
        Ok(())
    }
}

fn prepared_microphone() -> TrackMetadata {
    TrackMetadata {
        track_id: TrackId::new(),
        kind: TrackKind::Microphone,
        source_id: Some(SourceId::new("test-microphone").expect("source ID")),
        format: TrackFormat::Audio {
            sample_format: "F32LE".into(),
            sample_rate: 48_000,
            channels: 1,
        },
        segments: vec![SegmentMetadata {
            segment_id: SegmentId::new(),
            path: "microphone.wav".into(),
            start_ns: 0,
            end_ns: None,
            complete: false,
        }],
        metrics: TrackMetrics {
            samples_received: 480,
            samples_dropped: 480,
            ..TrackMetrics::default()
        },
        status: TrackStatus::Recording,
        termination_reason: None,
    }
}

#[test]
fn an_empty_writer_cannot_complete_a_track_with_received_but_dropped_audio() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let output_dir = temporary.path().join("session");
    let mut session = MediaSession::prepare(SessionConfig {
        output_dir: output_dir.clone(),
        camera: CameraSelection::Disabled,
        microphone: AudioSelection::Disabled,
        system_audio: AudioSelection::Disabled,
    })
    .expect("prepare");
    session.manifest.tracks.push(prepared_microphone());
    let config = AudioConfig {
        sample_rate: 48_000,
        channels: 1,
    };
    let limits = QueueLimits {
        packets: 4,
        bytes: 4096,
    };
    let writer = TrackWriter::open_audio(&output_dir.join("microphone.wav"), config, limits)
        .expect("audio writer");
    session.finish_track(TrackKind::Microphone, Some(writer), 10_000_000);
    let track = &session.manifest.tracks[0];
    assert_eq!(track.status, TrackStatus::Interrupted);
    assert_eq!(
        track.termination_reason.as_deref(),
        Some("source produced no media packets")
    );

    let mut session = MediaSession::prepare(SessionConfig {
        output_dir: temporary.path().join("successful-session"),
        camera: CameraSelection::Disabled,
        microphone: AudioSelection::Disabled,
        system_audio: AudioSelection::Disabled,
    })
    .expect("prepare second session");
    session.manifest.tracks.push(prepared_microphone());
    let writer = TrackWriter::open_audio(
        &session.layout.root().join("microphone.wav"),
        config,
        limits,
    )
    .expect("audio writer");
    writer
        .push_audio(AudioPacket {
            start_ns: 0,
            sample_rate: 48_000,
            channels: 1,
            frames: 480,
            data: vec![0.5; 480],
        })
        .expect("packet");
    session.finish_track(TrackKind::Microphone, Some(writer), 10_000_000);
    assert_eq!(session.manifest.tracks[0].status, TrackStatus::Completed);
}

#[test]
fn stop_interrupts_a_source_whose_reported_queue_never_drains() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let mut session = MediaSession::prepare(SessionConfig {
        output_dir: temporary.path().join("stalled-session"),
        camera: CameraSelection::Disabled,
        microphone: AudioSelection::Disabled,
        system_audio: AudioSelection::Disabled,
    })
    .expect("prepare");
    let reads = Arc::new(AtomicUsize::new(0));
    session.microphone = Some(Box::new(StalledAudio {
        reads: reads.clone(),
    }));
    session.manifest.tracks.push(prepared_microphone());
    session.system_audio = Some(Box::new(OnePacketAudio {
        packet: Mutex::new(Some(TimedAudioPacket {
            packet: AudioPacket {
                start_ns: 0,
                sample_rate: 48_000,
                channels: 1,
                frames: 480,
                data: vec![0.25; 480],
            },
            first_sample: 0,
            native_capture_ns: None,
        })),
    }));
    session.system_writer = Some(
        TrackWriter::open_audio(
            &session.layout.root().join("system-audio.wav"),
            AudioConfig {
                sample_rate: 48_000,
                channels: 1,
            },
            QueueLimits {
                packets: 4,
                bytes: 4096,
            },
        )
        .expect("system audio writer"),
    );
    let mut system_track = prepared_microphone();
    system_track.kind = TrackKind::SystemAudio;
    system_track.source_id = Some(SourceId::new("test-system-audio").expect("source ID"));
    system_track.segments[0].path = "system-audio.wav".into();
    system_track.metrics = TrackMetrics::default();
    session.manifest.tracks.push(system_track);
    session.start().expect("start");

    let started = Instant::now();
    let manifest = session.stop().expect("bounded stop");
    assert!(started.elapsed() < Duration::from_secs(1));
    assert!(reads.load(Ordering::Relaxed) <= 3);
    assert!(!manifest.completed);
    assert_eq!(manifest.tracks[0].status, TrackStatus::Interrupted);
    assert_eq!(
        manifest.tracks[0].termination_reason.as_deref(),
        Some("capture source queue did not drain after stop")
    );
    assert_eq!(manifest.tracks[1].status, TrackStatus::Completed);
    assert_eq!(manifest.tracks[1].metrics.samples_received, 480);
    assert!(
        temporary
            .path()
            .join("stalled-session/system-audio.wav")
            .is_file()
    );
}
