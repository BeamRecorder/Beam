#![allow(clippy::expect_used)]

use beam_media_encode::{AudioConfig, QueueLimits, TrackWriter};

#[test]
fn empty_audio_track_is_published_only_after_explicit_finish() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let destination = temporary.path().join("empty.wav");
    let writer = TrackWriter::open_audio(
        &destination,
        AudioConfig {
            sample_rate: 48_000,
            channels: 1,
        },
        QueueLimits {
            packets: 4,
            bytes: 4096,
        },
    )
    .expect("audio writer");
    assert!(!destination.exists());
    writer.finish().expect("EOS");
    let bytes = std::fs::read(destination).expect("published WAV");
    assert!(bytes.starts_with(b"RIFF"));
    assert_eq!(bytes.get(8..12), Some(b"WAVE".as_slice()));
}
