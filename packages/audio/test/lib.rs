use beam_audio::{AudioQueueLimits, TimedAudioPacket};
use beam_media_core::AudioPacket;

#[test]
fn public_audio_packet_contract_keeps_sample_position_and_queue_budget() {
    let limits = AudioQueueLimits::default();
    assert!(limits.packets > 0);
    assert!(limits.bytes >= limits.packets);
    let packet = TimedAudioPacket {
        packet: AudioPacket {
            start_ns: 12,
            sample_rate: 48_000,
            channels: 2,
            frames: 1,
            data: vec![0.5, -0.5],
        },
        first_sample: 20,
        native_capture_ns: Some(100),
    };
    assert_eq!(
        packet.packet.data.len(),
        usize::from(packet.packet.channels)
    );
    assert_eq!(packet.first_sample, 20);
    assert_eq!(packet.native_capture_ns, Some(100));
}
