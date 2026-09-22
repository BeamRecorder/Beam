#![allow(clippy::expect_used)]

use std::sync::Arc;

use beam_media_core::{AudioPacket, VideoFrame};

#[test]
fn cloned_video_frame_shares_owned_pixel_storage_and_timing() {
    let pixels: Arc<[u8]> = Arc::from([1, 2, 3, 4]);
    let frame = VideoFrame {
        captured_ns: 123_456,
        width: 1,
        height: 1,
        data: pixels,
    };

    let copy = frame.clone();
    assert_eq!(copy.captured_ns, 123_456);
    assert_eq!((copy.width, copy.height), (1, 1));
    assert!(Arc::ptr_eq(&frame.data, &copy.data));
}

#[test]
fn audio_packet_keeps_interleaved_samples_and_timing() {
    let packet = AudioPacket {
        start_ns: 250_000_000,
        sample_rate: 48_000,
        channels: 2,
        frames: 2,
        data: vec![1.0_f32, 2.0, 3.0, 4.0],
    };

    assert_eq!(packet.start_ns, 250_000_000);
    assert_eq!(
        (packet.sample_rate, packet.channels, packet.frames),
        (48_000, 2, 2)
    );
    assert_eq!(
        packet.data.chunks_exact(2).collect::<Vec<_>>(),
        vec![&[1.0, 2.0][..], &[3.0, 4.0][..]]
    );
}
