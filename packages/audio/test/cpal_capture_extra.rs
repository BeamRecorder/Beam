#![allow(clippy::expect_used)]

use super::*;

#[test]
fn cpal_fallback_prefers_float_and_clamps_default_sample_rate() {
    let default = SupportedStreamConfig::new(
        2,
        96_000,
        cpal::SupportedBufferSize::Unknown,
        SampleFormat::U16,
    );
    let integer = SupportedStreamConfigRange::new(
        2,
        44_100,
        96_000,
        cpal::SupportedBufferSize::Unknown,
        SampleFormat::I16,
    );
    let float = SupportedStreamConfigRange::new(
        1,
        44_100,
        48_000,
        cpal::SupportedBufferSize::Unknown,
        SampleFormat::F32,
    );
    let chosen = choose_fallback_config(default, &[integer, float]).expect("float fallback");
    assert_eq!(chosen.sample_format(), SampleFormat::F32);
    assert_eq!(chosen.sample_rate(), 48_000);
    assert_eq!(chosen.channels(), 1);
}

#[test]
fn cpal_fallback_accepts_integer_and_rejects_unhandled_formats() {
    let default = SupportedStreamConfig::new(
        2,
        8_000,
        cpal::SupportedBufferSize::Unknown,
        SampleFormat::U16,
    );
    let integer = SupportedStreamConfigRange::new(
        2,
        44_100,
        48_000,
        cpal::SupportedBufferSize::Unknown,
        SampleFormat::I16,
    );
    let chosen = choose_fallback_config(default, &[integer]).expect("integer fallback");
    assert_eq!(chosen.sample_format(), SampleFormat::I16);
    assert_eq!(chosen.sample_rate(), 44_100);
    assert!(matches!(
        choose_fallback_config(default, &[]),
        Err(AudioError::Unsupported(reason)) if reason.contains("neither F32 nor I16")
    ));
}

#[test]
fn cpal_fallback_preserves_in_range_rate_and_ignores_other_formats() {
    let default = SupportedStreamConfig::new(
        2,
        48_000,
        cpal::SupportedBufferSize::Unknown,
        SampleFormat::U16,
    );
    let unsupported = SupportedStreamConfigRange::new(
        2,
        8_000,
        192_000,
        cpal::SupportedBufferSize::Unknown,
        SampleFormat::U16,
    );
    let float = SupportedStreamConfigRange::new(
        2,
        44_100,
        96_000,
        cpal::SupportedBufferSize::Unknown,
        SampleFormat::F32,
    );
    let chosen = choose_fallback_config(default, &[unsupported, float]).expect("float fallback");
    assert_eq!(chosen.sample_format(), SampleFormat::F32);
    assert_eq!(chosen.sample_rate(), 48_000);
    assert_eq!(chosen.channels(), 2);
}

#[test]
fn cpal_fallback_rejects_only_unsupported_ranges_with_a_specific_error() {
    let default = SupportedStreamConfig::new(
        1,
        48_000,
        cpal::SupportedBufferSize::Unknown,
        SampleFormat::U16,
    );
    let unsupported = SupportedStreamConfigRange::new(
        1,
        8_000,
        96_000,
        cpal::SupportedBufferSize::Unknown,
        SampleFormat::U16,
    );
    assert!(matches!(
        choose_fallback_config(default, &[unsupported]),
        Err(AudioError::Unsupported(reason)) if reason == "device exposes neither F32 nor I16 samples"
    ));
}

#[test]
fn cpal_stopped_callback_ignores_bad_samples_and_does_not_emit_again() {
    let mut fixture = Fixture::new(1024, 1, 48_000);
    fixture.start();
    fixture.stopped = true;
    fixture.process_f32(&mut [], 0);
    assert!(fixture.packets.is_empty());
    assert!(fixture.events.is_empty());
    assert!(fixture.terminal_events.is_empty());
    assert_eq!(fixture.queued_bytes.load(Ordering::Acquire), 0);
}

#[test]
fn cpal_overflowed_byte_counter_drops_without_changing_accounting() {
    let mut fixture = Fixture::new(usize::MAX, 1, 48_000);
    fixture.start();
    fixture.queued_bytes.store(usize::MAX, Ordering::Release);
    fixture.process_f32(&mut [0.25, -0.25], 2);
    assert!(fixture.packets.is_empty());
    assert_eq!(fixture.queued_bytes.load(Ordering::Acquire), usize::MAX);
    assert!(fixture.events.try_iter().any(|event| matches!(
        event,
        AudioEvent::Dropped {
            first_sample: 0,
            frames: 1
        }
    )));
}

#[test]
fn cpal_integer_conversion_handles_extreme_signed_values() {
    let mut fixture = Fixture::new(1024, 1, 48_000);
    fixture.start();
    fixture.process_i16(&mut [i16::MIN, i16::MAX, -1, 1], 2);
    let packet = fixture.packets.try_recv().expect("integer packet");
    assert_eq!(packet.packet.data[0], -1.0);
    assert_eq!(packet.packet.data[1], f32::from(i16::MAX) / 32768.0);
    assert_eq!(packet.packet.data[2], -1.0 / 32768.0);
    assert_eq!(packet.packet.data[3], 1.0 / 32768.0);
}

#[test]
fn mono_float_callback_preserves_one_channel_frame_and_native_time() {
    let mut fixture = Fixture::new(4, 1, 48_000);
    fixture.start();
    fixture.process_f32(&mut [0.375], 1);
    let packet = fixture.packets.try_recv().expect("mono packet");
    assert_eq!(packet.packet.channels, 1);
    assert_eq!(packet.packet.frames, 1);
    assert_eq!(packet.packet.data, [0.375]);
    assert_eq!(packet.first_sample, 0);
    assert_eq!(packet.native_capture_ns, Some(1_000_000_000));
    assert_eq!(fixture.queued_bytes.load(Ordering::Acquire), 4);
}

#[test]
fn disconnected_regular_event_receiver_does_not_prevent_packet_delivery() {
    let mut fixture = Fixture::new(8, 1, 48_000);
    fixture.start();
    drop(std::mem::replace(
        &mut fixture.events,
        crossbeam_channel::never(),
    ));
    fixture.process_f32(&mut [0.25, -0.25], 2);
    let packet = fixture
        .packets
        .try_recv()
        .expect("packet despite closed events");
    assert_eq!(packet.packet.data, [0.25, -0.25]);
    assert_eq!(fixture.queued_bytes.load(Ordering::Acquire), 8);
    assert!(fixture.terminal_events.is_empty());
}

#[test]
fn saturated_regular_event_channel_drops_notifications_without_stalling_audio() {
    let mut fixture = Fixture::new(0, 1, 48_000);
    fixture.start();
    for index in 0..16 {
        fixture
            .events_tx
            .try_send(AudioEvent::Dropped {
                first_sample: index,
                frames: 1,
            })
            .expect("fill regular event channel");
    }
    fixture.process_f32(&mut [0.0, 0.0], 2);
    assert_eq!(fixture.events.len(), 16);
    assert!(fixture.packets.is_empty());
    assert_eq!(fixture.queued_bytes.load(Ordering::Acquire), 0);
    assert!(fixture.terminal_events.is_empty());
    fixture.process_f32(&mut [0.0, 0.0], 2);
    assert_eq!(fixture.events.len(), 16);
}

#[test]
fn saturated_terminal_channel_keeps_first_error_from_bad_callback() {
    let mut fixture = Fixture::new(8, 1, 48_000);
    fixture.start();
    fixture
        .terminal_tx
        .try_send(AudioEvent::DeviceChanged("device removed".into()))
        .expect("fill terminal channel");
    fixture.process_f32(&mut [], 2);
    assert!(matches!(
        fixture.terminal_events.try_recv(),
        Ok(AudioEvent::DeviceChanged(reason)) if reason == "device removed"
    ));
    assert!(fixture.terminal_events.is_empty());
    assert!(fixture.packets.is_empty());
}

#[test]
fn disconnected_terminal_receiver_does_not_leak_reserved_bytes_on_unsupported_type() {
    let mut fixture = Fixture::new(8, 1, 48_000);
    fixture.start();
    drop(std::mem::replace(
        &mut fixture.terminal_events,
        crossbeam_channel::never(),
    ));
    fixture.process_u16(&mut [0, u16::MAX], 2);
    assert!(fixture.packets.is_empty());
    assert_eq!(fixture.queued_bytes.load(Ordering::Acquire), 0);
}
