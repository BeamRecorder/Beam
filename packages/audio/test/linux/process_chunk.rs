#![cfg(test)]
#![allow(clippy::expect_used)]

use super::validated_audio_chunk;
use crate::AudioError;

#[test]
fn pipewire_chunk_exposes_only_the_selected_complete_frames() {
    let memory = [99_u8, 99, 99, 99, 1, 2, 3, 4, 5, 6, 7, 8, 99, 99];
    let (frames, bytes) = validated_audio_chunk(Some(&memory), 4, 8, 1)
        .expect("valid chunk")
        .expect("nonempty chunk");
    assert_eq!(frames, 2);
    assert_eq!(bytes, &[1, 2, 3, 4, 5, 6, 7, 8]);

    let (frames, bytes) = validated_audio_chunk(Some(&memory), 4, 8, 2)
        .expect("valid stereo chunk")
        .expect("nonempty chunk");
    assert_eq!(frames, 1);
    assert_eq!(bytes.len(), 8);
}

#[test]
fn pipewire_chunk_ignores_empty_partial_and_zero_channel_audio() {
    let memory = [0_u8; 16];
    for (offset, size, channels) in [(0, 0, 1), (0, 6, 1), (0, 8, 0), (0, 4, 2)] {
        assert!(
            validated_audio_chunk(Some(&memory), offset, size, channels)
                .expect("invalid but nonfatal chunk")
                .is_none()
        );
    }
}

#[test]
fn pipewire_chunk_reports_missing_or_out_of_bounds_memory() {
    let memory = [0_u8; 12];
    for (bytes, offset, size) in [(None, 0, 8), (Some(memory.as_slice()), 8, 8)] {
        let result = validated_audio_chunk(bytes, offset, size, 1);
        assert!(matches!(
            result,
            Err(AudioError::Backend(reason)) if reason.contains("buffer is invalid")
        ));
    }
}
