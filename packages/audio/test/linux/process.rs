#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;

fn state() -> ProcessState {
    let (packet_tx, _) = crossbeam_channel::bounded(1);
    let (event_tx, _) = crossbeam_channel::bounded(1);
    let (terminal_tx, _) = crossbeam_channel::bounded(1);
    ProcessState {
        format: None,
        clock: SessionClock::start(),
        gate: Arc::new(StartGate::new()),
        sample_clock: None,
        next_sample: 0,
        active: true,
        packet_tx,
        event_tx,
        terminal_tx,
        queued_bytes: Arc::new(AtomicUsize::new(0)),
        byte_limit: 1024,
        last_native_timestamp_ns: None,
        native_timestamps_invalidated: false,
    }
}

struct ProcessFixture {
    state: ProcessState,
    packets: crossbeam_channel::Receiver<TimedAudioPacket>,
    events: crossbeam_channel::Receiver<AudioEvent>,
    failures: crossbeam_channel::Receiver<AudioEvent>,
}

impl ProcessFixture {
    fn new(byte_limit: usize, packet_limit: usize, sample_rate: u32) -> Self {
        let (packet_tx, packets) = crossbeam_channel::bounded(packet_limit);
        let (event_tx, events) = crossbeam_channel::bounded(4);
        let (terminal_tx, failures) = crossbeam_channel::bounded(1);
        Self {
            state: ProcessState {
                format: Some(NegotiatedFormat {
                    sample_rate,
                    channels: 2,
                }),
                clock: SessionClock::start(),
                gate: Arc::new(StartGate::new()),
                sample_clock: None,
                next_sample: 0,
                active: true,
                packet_tx,
                event_tx,
                terminal_tx,
                queued_bytes: Arc::new(AtomicUsize::new(0)),
                byte_limit,
                last_native_timestamp_ns: None,
                native_timestamps_invalidated: false,
            },
            packets,
            events,
            failures,
        }
    }

    fn start(&self) {
        self.state
            .gate
            .release(self.state.clock.now_ns())
            .expect("release start gate");
    }

    fn process(&mut self, frames: u32, samples: &[f32], native_ns: Option<u64>) {
        let bytes: Vec<u8> = samples
            .iter()
            .flat_map(|sample| sample.to_le_bytes())
            .collect();
        let sample_rate = self.state.format.expect("format").sample_rate;
        process_bytes(
            &mut self.state,
            NegotiatedFormat {
                sample_rate,
                channels: 2,
            },
            frames,
            &bytes,
            native_ns,
        );
    }
}

#[test]
fn invalid_and_discontinuous_pipewire_header_pts_are_not_used() {
    assert_eq!(usable_header_pts(-1, MetaHeaderFlags::empty()), None);
    assert_eq!(usable_header_pts(i64::MIN, MetaHeaderFlags::empty()), None);
    assert_eq!(usable_header_pts(0, MetaHeaderFlags::empty()), Some(0));
    assert_eq!(usable_header_pts(123, MetaHeaderFlags::DISCONT), None);
    assert_eq!(usable_header_pts(123, MetaHeaderFlags::CORRUPTED), None);
}

#[test]
fn pipewire_header_pts_must_remain_monotonic() {
    let mut state = state();
    assert_eq!(
        state.native_timestamp(100, MetaHeaderFlags::empty()),
        Some(100)
    );
    assert_eq!(
        state.native_timestamp(110, MetaHeaderFlags::empty()),
        Some(110)
    );
    assert_eq!(state.native_timestamp(109, MetaHeaderFlags::empty()), None);
    assert_eq!(state.native_timestamp(120, MetaHeaderFlags::empty()), None);
}

#[test]
fn pipewire_discontinuity_after_samples_invalidates_drift_measurement() {
    let mut state = state();
    assert_eq!(
        state.native_timestamp(100, MetaHeaderFlags::empty()),
        Some(100)
    );
    state.next_sample = 256;
    assert_eq!(state.native_timestamp(200, MetaHeaderFlags::DISCONT), None);
    assert_eq!(state.native_timestamp(300, MetaHeaderFlags::empty()), None);
}

#[test]
fn discontinuity_on_the_first_packet_does_not_poison_later_timestamps() {
    let mut state = state();
    assert_eq!(state.native_timestamp(100, MetaHeaderFlags::DISCONT), None);
    assert!(!state.native_timestamps_invalidated);
    assert_eq!(
        state.native_timestamp(101, MetaHeaderFlags::empty()),
        Some(101)
    );
    assert_eq!(
        state.native_timestamp(101, MetaHeaderFlags::empty()),
        Some(101)
    );
}

#[test]
fn pipewire_packet_processing_waits_for_gate_and_preserves_native_stamp() {
    let mut fixture = ProcessFixture::new(32, 2, 48_000);
    fixture.process(1, &[0.25, -0.5], Some(123));
    assert!(fixture.packets.is_empty());
    assert_eq!(fixture.state.next_sample, 0);
    fixture.start();
    fixture.process(1, &[0.25, -0.5], Some(123));
    let packet = fixture.packets.try_recv().expect("packet");
    assert_eq!(packet.packet.data, [0.25, -0.5]);
    assert_eq!(packet.native_capture_ns, Some(123));
    assert_eq!(packet.first_sample, 0);
    assert_eq!(fixture.state.next_sample, 1);
    assert_eq!(fixture.state.queued_bytes.load(Ordering::Acquire), 8);
    assert!(fixture.events.is_empty());
    assert!(fixture.failures.is_empty());
}

#[test]
fn pipewire_invalid_sample_rate_does_not_advance_or_queue() {
    let mut fixture = ProcessFixture::new(32, 2, 0);
    fixture.start();
    fixture.process(1, &[0.25, -0.5], None);
    assert!(fixture.packets.is_empty());
    assert_eq!(fixture.state.next_sample, 0);
    assert_eq!(fixture.state.queued_bytes.load(Ordering::Acquire), 0);
}

#[test]
fn pipewire_sample_counter_overflow_does_not_reserve_queue_bytes() {
    let mut fixture = ProcessFixture::new(32, 2, 48_000);
    fixture.start();
    fixture.state.next_sample = u64::MAX;
    fixture.process(1, &[0.25, -0.5], None);
    assert!(fixture.packets.is_empty());
    assert_eq!(fixture.state.next_sample, u64::MAX);
    assert_eq!(fixture.state.queued_bytes.load(Ordering::Acquire), 0);
}

#[test]
fn pipewire_byte_limit_is_inclusive_and_drops_keep_sample_position() {
    let mut fixture = ProcessFixture::new(8, 2, 48_000);
    fixture.start();
    fixture.process(1, &[0.0, 0.5], None);
    fixture.process(1, &[0.5, 0.0], None);
    assert_eq!(fixture.packets.len(), 1);
    assert_eq!(fixture.state.next_sample, 2);
    assert_eq!(fixture.state.queued_bytes.load(Ordering::Acquire), 8);
    assert!(matches!(
        fixture.events.try_recv(),
        Ok(AudioEvent::Dropped {
            first_sample: 1,
            frames: 1
        })
    ));
}

#[test]
fn pipewire_disconnected_consumer_releases_reserved_bytes() {
    let mut fixture = ProcessFixture::new(8, 1, 48_000);
    fixture.start();
    let receiver = std::mem::replace(&mut fixture.packets, crossbeam_channel::never());
    drop(receiver);
    fixture.process(1, &[0.25, -0.5], None);
    assert_eq!(fixture.state.queued_bytes.load(Ordering::Acquire), 0);
    assert!(matches!(
        fixture.failures.try_recv(),
        Ok(AudioEvent::Failed(_))
    ));
}

#[test]
fn pipewire_packet_queue_full_reports_exact_dropped_position() {
    let mut fixture = ProcessFixture::new(32, 1, 48_000);
    fixture.start();
    fixture.process(1, &[0.0, 0.25], Some(100));
    fixture.process(1, &[0.5, 0.75], Some(200));
    assert_eq!(fixture.packets.len(), 1);
    assert_eq!(fixture.state.next_sample, 2);
    assert_eq!(fixture.state.queued_bytes.load(Ordering::Acquire), 8);
    assert!(matches!(
        fixture.events.try_recv(),
        Ok(AudioEvent::Dropped {
            first_sample: 1,
            frames: 1
        })
    ));
    assert!(fixture.failures.is_empty());
}

#[test]
fn pipewire_overflowed_byte_count_drops_without_changing_accounting() {
    let mut fixture = ProcessFixture::new(usize::MAX, 1, 48_000);
    fixture.start();
    fixture
        .state
        .queued_bytes
        .store(usize::MAX, Ordering::Release);
    fixture.process(1, &[0.25, -0.5], None);
    assert!(fixture.packets.is_empty());
    assert_eq!(
        fixture.state.queued_bytes.load(Ordering::Acquire),
        usize::MAX
    );
    assert!(matches!(
        fixture.events.try_recv(),
        Ok(AudioEvent::Dropped {
            first_sample: 0,
            frames: 1
        })
    ));
}

#[test]
fn pipewire_dropped_packet_keeps_sample_clock_for_next_packet() {
    let mut fixture = ProcessFixture::new(8, 2, 48_000);
    fixture.start();
    fixture.process(2, &[0.0, 0.0, 0.0, 0.0], None);
    assert!(matches!(
        fixture.events.try_recv(),
        Ok(AudioEvent::Dropped {
            first_sample: 0,
            frames: 2
        })
    ));
    fixture.process(1, &[0.5, -0.5], None);
    let packet = fixture.packets.try_recv().expect("packet after drop");
    assert_eq!(packet.first_sample, 2);
    assert!(packet.packet.start_ns >= 2_000_000_000 / 48_000);
    assert_eq!(fixture.state.next_sample, 3);
}

#[test]
fn pipewire_corrupt_initial_timestamp_does_not_disable_later_valid_clock() {
    let mut state = state();
    assert_eq!(state.native_timestamp(-1, MetaHeaderFlags::empty()), None);
    assert!(!state.native_timestamps_invalidated);
    assert_eq!(
        state.native_timestamp(400, MetaHeaderFlags::empty()),
        Some(400)
    );
    state.next_sample = 1;
    assert_eq!(
        state.native_timestamp(500, MetaHeaderFlags::CORRUPTED),
        None
    );
    assert!(state.native_timestamps_invalidated);
    assert_eq!(state.native_timestamp(600, MetaHeaderFlags::empty()), None);
}

#[test]
fn pipewire_sample_clock_overflow_keeps_counters_and_queue_untouched() {
    let mut fixture = ProcessFixture::new(32, 2, 1);
    fixture.start();
    fixture.state.sample_clock = AudioSampleClock::new(u64::MAX - 1, 1).ok();
    fixture.process(1, &[0.25, -0.5], None);
    assert!(fixture.packets.is_empty());
    assert_eq!(fixture.state.next_sample, 0);
    assert_eq!(fixture.state.queued_bytes.load(Ordering::Acquire), 0);
    assert!(fixture.events.is_empty());
    assert!(fixture.failures.is_empty());
}

#[test]
fn pipewire_drop_event_queue_saturation_does_not_block_audio_callback() {
    let mut fixture = ProcessFixture::new(0, 1, 48_000);
    fixture.start();
    for first_sample in 0..4 {
        fixture.process(1, &[0.0, 0.0], None);
        assert_eq!(fixture.state.next_sample, first_sample + 1);
    }
    assert_eq!(fixture.events.len(), 4);
    fixture.process(1, &[0.0, 0.0], None);
    assert_eq!(fixture.state.next_sample, 5);
    assert_eq!(fixture.events.len(), 4);
    assert!(fixture.packets.is_empty());
    assert_eq!(fixture.state.queued_bytes.load(Ordering::Acquire), 0);
}
