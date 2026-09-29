#[path = "../../src/beam/audio_meters/signal.rs"]
mod signal;
use beam_audio::{AudioEvent, TimedAudioPacket};
use beam_media_core::AudioPacket;

#[test]
fn actual_pcm_measures_both_polarities_and_preserves_packet_time() {
    let level = signal::level(123, &[-0.5, 0.5]).unwrap();
    assert_eq!(level.timestamp_ns, 123);
    assert_eq!(level.peak, 0.5);
    assert_eq!(level.rms, 0.5);
}

#[test]
fn silence_and_clipping_are_distinct_from_missing_data() {
    assert_eq!(signal::level(0, &[0.0; 8]).unwrap().peak, 0.0);
    assert_eq!(signal::level(0, &[-1.5, 0.0]).unwrap().peak, 1.5);
    assert!(signal::drain(|| Ok(None), || None).unwrap().is_none());
}

#[test]
fn invalid_packets_do_not_become_fabricated_silence() {
    for values in [
        &[][..],
        &[f32::NAN][..],
        &[f32::INFINITY][..],
        &[f32::NEG_INFINITY][..],
    ] {
        assert!(signal::level(0, values).is_err());
    }
}

#[test]
fn native_disconnect_and_failure_are_reported_before_meter_data() {
    for event in [
        AudioEvent::Disconnected("unplugged".into()),
        AudioEvent::Failed("denied".into()),
    ] {
        let mut event = Some(event);
        assert!(
            signal::drain(
                || panic!("failed sources must not be sampled"),
                || event.take()
            )
            .is_err()
        );
    }
}

#[test]
fn bounded_packet_drain_retains_a_transient_peak_and_latest_timestamp() {
    let mut packets = [0.8, 0.1]
        .into_iter()
        .enumerate()
        .map(|(index, amplitude)| TimedAudioPacket {
            packet: AudioPacket {
                start_ns: index as u64,
                sample_rate: 48000,
                channels: 1,
                frames: 1,
                data: vec![amplitude],
            },
            first_sample: index as u64,
            native_capture_ns: None,
        });
    let level = signal::drain(|| Ok(packets.next()), || None)
        .unwrap()
        .unwrap();
    assert_eq!(level.timestamp_ns, 1);
    assert_eq!(level.peak, 0.8);
    assert_eq!(level.rms, 0.8);
}
