#![cfg(test)]
#![allow(clippy::expect_used)]

use super::{begin_segment, writer_worker};
use crate::system_audio::{SystemAudioFormat, SystemAudioSegment};
use std::sync::{Arc, Mutex};

#[test]
fn writer_finalizes_a_segment_after_samples() {
    let dir = tempfile::tempdir().expect("directory");
    let path = dir.path().join("audio.wav");
    let format = SystemAudioFormat {
        sample_rate: 48_000,
        channels: 1,
    };
    let mut active = None;
    begin_segment(
        &mut active,
        format,
        SystemAudioSegment {
            path: path.clone(),
            start_ns: 0,
        },
    )
    .expect("begin segment");
    assert!(
        begin_segment(
            &mut active,
            format,
            SystemAudioSegment {
                path: path.clone(),
                start_ns: 1
            }
        )
        .is_err()
    );
    let (sender, receiver) = crossbeam_channel::bounded(4);
    sender
        .send(super::super::SinkMessage::Samples(
            0.5_f32.to_le_bytes().to_vec(),
        ))
        .expect("samples");
    sender
        .send(super::super::SinkMessage::Finish)
        .expect("finish");
    writer_worker(receiver, format, active, Arc::new(Mutex::new(None))).expect("writer");
    let bytes = std::fs::read(path).expect("wav file");
    assert!(bytes.starts_with(b"RIFF"));
    assert_eq!(&bytes[bytes.len() - 4..], &0.5_f32.to_le_bytes());
}
