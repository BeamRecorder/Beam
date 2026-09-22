#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;

struct Fixture {
    clock: SessionClock,
    gate: Arc<StartGate>,
    packets_tx: Sender<TimedAudioPacket>,
    packets: Receiver<TimedAudioPacket>,
    events_tx: Sender<AudioEvent>,
    events: Receiver<AudioEvent>,
    terminal_tx: Sender<AudioEvent>,
    terminal_events: Receiver<AudioEvent>,
    queued_bytes: AtomicUsize,
    byte_limit: usize,
    sample_rate: u32,
    timeline: AudioTimeline,
    stopped: bool,
}

impl Fixture {
    fn new(byte_limit: usize, packet_limit: usize, sample_rate: u32) -> Self {
        let (packets_tx, packets) = crossbeam_channel::bounded(packet_limit);
        let (events_tx, events) = crossbeam_channel::bounded(16);
        let (terminal_tx, terminal_events) = crossbeam_channel::bounded(1);
        Self {
            clock: SessionClock::start(),
            gate: Arc::new(StartGate::new()),
            packets_tx,
            packets,
            events_tx,
            events,
            terminal_tx,
            terminal_events,
            queued_bytes: AtomicUsize::new(0),
            byte_limit,
            sample_rate,
            timeline: AudioTimeline::new(sample_rate),
            stopped: false,
        }
    }

    fn start(&self) {
        self.gate
            .release(self.clock.now_ns())
            .expect("release test start gate");
    }

    fn process_f32(&mut self, samples: &mut [f32], channels: u16) {
        self.process_f32_at(samples, channels, 1_000_000_000, 1_001_000_000);
    }

    fn process_f32_at(
        &mut self,
        samples: &mut [f32],
        channels: u16,
        capture_ns: u64,
        callback_ns: u64,
    ) {
        // SAFETY: The pointer, sample count, and format describe this live f32 slice.
        let data = unsafe {
            cpal::Data::from_parts(
                samples.as_mut_ptr().cast(),
                samples.len(),
                SampleFormat::F32,
            )
        };
        self.process_at(&data, SampleFormat::F32, channels, capture_ns, callback_ns);
    }

    fn process_i16(&mut self, samples: &mut [i16], channels: u16) {
        // SAFETY: The pointer, sample count, and format describe this live i16 slice.
        let data = unsafe {
            cpal::Data::from_parts(
                samples.as_mut_ptr().cast(),
                samples.len(),
                SampleFormat::I16,
            )
        };
        self.process(&data, SampleFormat::I16, channels);
    }

    fn process_u16(&mut self, samples: &mut [u16], channels: u16) {
        // SAFETY: The pointer, sample count, and format describe this live u16 slice.
        let data = unsafe {
            cpal::Data::from_parts(
                samples.as_mut_ptr().cast(),
                samples.len(),
                SampleFormat::U16,
            )
        };
        self.process(&data, SampleFormat::U16, channels);
    }

    fn process(&mut self, data: &cpal::Data, format: SampleFormat, channels: u16) {
        self.process_at(data, format, channels, 1_000_000_000, 1_001_000_000);
    }

    fn process_at(
        &mut self,
        data: &cpal::Data,
        format: SampleFormat,
        channels: u16,
        capture_ns: u64,
        callback_ns: u64,
    ) {
        let info = cpal::InputCallbackInfo::new(cpal::InputStreamTimestamp {
            capture: cpal::StreamInstant::from_nanos(capture_ns),
            callback: cpal::StreamInstant::from_nanos(callback_ns),
        });
        process_callback(
            data,
            &info,
            format,
            channels,
            self.sample_rate,
            &self.clock,
            &self.gate,
            self.byte_limit,
            &self.queued_bytes,
            &self.packets_tx,
            &self.events_tx,
            &self.terminal_tx,
            &mut self.timeline,
            &mut self.stopped,
        );
    }
}

#[test]
fn cpal_clock_regression_emits_one_event_and_omits_later_native_timestamps() {
    let mut fixture = Fixture::new(1024, 3, 48_000);
    fixture.start();
    fixture.process_f32_at(&mut [0.0, 0.0], 2, 1_000_000_000, 1_001_000_000);
    fixture.process_f32_at(&mut [0.0, 0.0], 2, 999_000_000, 1_011_000_000);
    fixture.process_f32_at(&mut [0.0, 0.0], 2, 1_020_000_000, 1_021_000_000);
    assert_eq!(
        fixture.packets.try_recv().expect("first").native_capture_ns,
        Some(1_000_000_000)
    );
    assert_eq!(
        fixture
            .packets
            .try_recv()
            .expect("regressed")
            .native_capture_ns,
        None
    );
    assert_eq!(
        fixture.packets.try_recv().expect("later").native_capture_ns,
        None
    );
    let discontinuities = fixture
        .events
        .try_iter()
        .filter(|event| matches!(event, AudioEvent::ClockDiscontinuity { first_sample: 1 }))
        .count();
    assert_eq!(discontinuities, 1);
}

#[test]
fn invalid_first_cpal_timestamp_starts_audio_without_a_native_anchor() {
    let mut fixture = Fixture::new(1024, 1, 48_000);
    fixture.start();
    fixture.process_f32_at(&mut [0.0, 0.0], 2, 2_000_000_000, 1_999_000_000);
    assert_eq!(
        fixture
            .packets
            .try_recv()
            .expect("audio packet")
            .native_capture_ns,
        None
    );
    let events: Vec<_> = fixture.events.try_iter().collect();
    assert!(matches!(
        events.first(),
        Some(AudioEvent::ClockDiscontinuity { first_sample: 0 })
    ));
    assert!(matches!(events.get(1), Some(AudioEvent::Started)));
    assert_eq!(events.len(), 2);
}

#[test]
fn callback_waits_for_shared_start_gate() {
    let mut fixture = Fixture::new(1024, 1, 48_000);
    fixture.process_f32(&mut [0.0, 0.25], 2);
    assert!(fixture.packets.is_empty());
    assert!(fixture.events.is_empty());
}

#[test]
fn float_and_integer_callbacks_preserve_samples_and_native_anchor() {
    let mut float = Fixture::new(1024, 1, 48_000);
    float.start();
    float.process_f32(&mut [0.5, -0.5], 2);
    let packet = float.packets.try_recv().expect("float packet");
    assert_eq!(packet.packet.data, [0.5, -0.5]);
    assert_eq!(packet.packet.frames, 1);
    assert_eq!(packet.first_sample, 0);
    assert_eq!(packet.native_capture_ns, Some(1_000_000_000));
    assert!(matches!(
        float.events.try_recv(),
        Ok(AudioEvent::Anchor { .. })
    ));
    assert!(matches!(float.events.try_recv(), Ok(AudioEvent::Started)));

    let mut integer = Fixture::new(1024, 1, 48_000);
    integer.start();
    integer.process_i16(&mut [i16::MIN, 0, i16::MAX, 0], 2);
    let packet = integer.packets.try_recv().expect("integer packet");
    assert_eq!(packet.packet.frames, 2);
    assert_eq!(packet.packet.data[0], -1.0);
    assert_eq!(packet.packet.data[1], 0.0);
    assert!(packet.packet.data[2] > 0.99);
}

#[test]
fn malformed_or_unsupported_callbacks_report_failure_without_queued_bytes() {
    let mut malformed = Fixture::new(1024, 1, 48_000);
    malformed.start();
    malformed.process_f32(&mut [0.0, 0.0, 0.0, 0.0], 3);
    assert!(matches!(
        malformed.terminal_events.try_recv(),
        Ok(AudioEvent::Failed(_))
    ));
    assert!(malformed.packets.is_empty());

    let mut unsupported = Fixture::new(1024, 1, 48_000);
    unsupported.start();
    unsupported.process_u16(&mut [0, u16::MAX], 2);
    assert!(matches!(
        unsupported.events.try_recv(),
        Ok(AudioEvent::Anchor { .. })
    ));
    assert!(matches!(
        unsupported.events.try_recv(),
        Ok(AudioEvent::Started)
    ));
    assert!(matches!(
        unsupported.terminal_events.try_recv(),
        Ok(AudioEvent::Failed(_))
    ));
    assert_eq!(unsupported.queued_bytes.load(Ordering::Acquire), 0);
    assert!(unsupported.packets.is_empty());
}

#[test]
fn queue_byte_and_packet_limits_report_drops_without_blocking() {
    let mut byte_limited = Fixture::new(4, 1, 48_000);
    byte_limited.start();
    byte_limited.process_f32(&mut [0.0, 0.0], 2);
    assert!(matches!(
        byte_limited.events.try_recv(),
        Ok(AudioEvent::Anchor { .. })
    ));
    assert!(matches!(
        byte_limited.events.try_recv(),
        Ok(AudioEvent::Started)
    ));
    assert!(matches!(
        byte_limited.events.try_recv(),
        Ok(AudioEvent::Dropped { frames: 1, .. })
    ));
    assert!(byte_limited.packets.is_empty());
    assert_eq!(byte_limited.queued_bytes.load(Ordering::Acquire), 0);

    let mut packet_limited = Fixture::new(32, 1, 48_000);
    packet_limited.start();
    packet_limited.process_f32(&mut [0.0, 0.0], 2);
    packet_limited.process_f32(&mut [0.0, 0.0], 2);
    assert_eq!(packet_limited.queued_bytes.load(Ordering::Acquire), 8);
    assert!(packet_limited.events.try_iter().any(|event| matches!(
        event,
        AudioEvent::Dropped {
            first_sample: 1,
            frames: 1
        }
    )));
}

#[test]
fn invalid_timeline_or_disconnected_consumer_reports_failure() {
    let mut invalid_clock = Fixture::new(1024, 1, 0);
    invalid_clock.start();
    invalid_clock.process_f32(&mut [0.0, 0.0], 2);
    assert!(matches!(
        invalid_clock.terminal_events.try_recv(),
        Ok(AudioEvent::Failed(_))
    ));

    let mut disconnected = Fixture::new(1024, 1, 48_000);
    disconnected.start();
    let receiver = std::mem::replace(&mut disconnected.packets, crossbeam_channel::never());
    drop(receiver);
    disconnected.process_f32(&mut [0.0, 0.0], 2);
    assert!(
        disconnected
            .terminal_events
            .try_iter()
            .any(|event| matches!(event, AudioEvent::Failed(_)))
    );
    assert_eq!(disconnected.queued_bytes.load(Ordering::Acquire), 0);
}

#[test]
fn unpaced_source_fails_before_queuing_future_audio() {
    let mut fixture = Fixture::new(1024, 4, 1);
    fixture.start();
    fixture.process_f32(&mut [0.0; 6], 2);
    assert!(fixture.stopped);
    assert!(fixture.packets.is_empty());
    assert_eq!(fixture.queued_bytes.load(Ordering::Acquire), 0);
    assert!(matches!(
        fixture.terminal_events.try_recv(),
        Ok(AudioEvent::Failed(reason)) if reason.contains("faster than real time")
    ));
}

#[test]
fn callbacks_up_to_two_seconds_ahead_remain_accepted() {
    let mut fixture = Fixture::new(1024, 4, 1);
    fixture.start();
    fixture.process_f32(&mut [0.0; 4], 2);
    assert!(!fixture.stopped);
    assert_eq!(fixture.packets.try_recv().expect("packet").packet.frames, 2);
}

#[test]
fn failed_unpaced_source_ignores_later_callbacks() {
    let mut fixture = Fixture::new(1024, 4, 1);
    fixture.start();
    fixture.process_f32(&mut [0.0; 6], 2);
    assert!(matches!(
        fixture.terminal_events.try_recv(),
        Ok(AudioEvent::Failed(_))
    ));
    fixture.process_f32(&mut [0.0; 2], 2);
    assert!(fixture.terminal_events.is_empty());
    assert!(fixture.packets.is_empty());
}

#[test]
fn terminal_failure_survives_saturated_drop_events() {
    let mut fixture = Fixture::new(0, 1, 48_000);
    fixture.start();
    for _ in 0..16 {
        fixture.process_f32(&mut [0.0, 0.0], 2);
    }
    assert_eq!(fixture.events.len(), 16);
    fixture.sample_rate = 1;
    fixture.timeline = AudioTimeline::new(1);
    fixture.process_f32(&mut [0.0; 6], 2);
    assert!(matches!(
        fixture.terminal_events.try_recv(),
        Ok(AudioEvent::Failed(reason)) if reason.contains("faster than real time")
    ));
}

#[test]
fn empty_and_zero_channel_callbacks_fail_without_starting_capture() {
    let mut empty = Fixture::new(1024, 1, 48_000);
    empty.start();
    empty.process_f32(&mut [], 2);
    assert!(matches!(
        empty.terminal_events.try_recv(),
        Ok(AudioEvent::Failed(reason)) if reason.contains("invalid audio callback size")
    ));
    assert!(empty.events.is_empty());
    assert!(empty.packets.is_empty());

    let mut zero_channels = Fixture::new(1024, 1, 48_000);
    zero_channels.start();
    zero_channels.process_f32(&mut [0.0, 0.0], 0);
    assert!(matches!(
        zero_channels.terminal_events.try_recv(),
        Ok(AudioEvent::Failed(reason)) if reason.contains("invalid audio callback size")
    ));
    assert_eq!(zero_channels.queued_bytes.load(Ordering::Acquire), 0);
}

#[test]
fn cpal_byte_budget_accepts_exact_packet_size_then_reports_next_drop() {
    let mut fixture = Fixture::new(8, 2, 48_000);
    fixture.start();
    fixture.process_f32(&mut [0.25, -0.25], 2);
    fixture.process_f32(&mut [0.5, -0.5], 2);
    assert_eq!(fixture.queued_bytes.load(Ordering::Acquire), 8);
    assert_eq!(fixture.packets.len(), 1);
    assert!(fixture.events.try_iter().any(|event| matches!(
        event,
        AudioEvent::Dropped {
            first_sample: 1,
            frames: 1
        }
    )));
}

#[test]
fn cpal_callback_regressing_only_callback_clock_invalidates_native_time() {
    let mut fixture = Fixture::new(1024, 2, 48_000);
    fixture.start();
    fixture.process_f32_at(&mut [0.0, 0.0], 2, 1_000_000_000, 1_010_000_000);
    fixture.process_f32_at(&mut [0.0, 0.0], 2, 1_001_000_000, 1_009_000_000);
    assert_eq!(
        fixture.packets.try_recv().expect("first").native_capture_ns,
        Some(1_000_000_000)
    );
    assert_eq!(
        fixture
            .packets
            .try_recv()
            .expect("second")
            .native_capture_ns,
        None
    );
    assert!(
        fixture
            .events
            .try_iter()
            .any(|event| matches!(event, AudioEvent::ClockDiscontinuity { first_sample: 1 }))
    );
}

#[path = "cpal_capture_extra.rs"]
mod extra_checks;

#[path = "cpal_custom/mod.rs"]
mod custom_checks;
