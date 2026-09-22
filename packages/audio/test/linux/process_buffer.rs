#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;

struct BufferFixture {
    state: ProcessState,
    packets: crossbeam_channel::Receiver<TimedAudioPacket>,
    events: crossbeam_channel::Receiver<AudioEvent>,
    failures: crossbeam_channel::Receiver<AudioEvent>,
}

impl BufferFixture {
    fn new(packet_capacity: usize, byte_limit: usize) -> Self {
        let (packet_tx, packets) = crossbeam_channel::bounded(packet_capacity);
        let (event_tx, events) = crossbeam_channel::bounded(4);
        let (terminal_tx, failures) = crossbeam_channel::bounded(1);
        Self {
            state: ProcessState {
                format: Some(NegotiatedFormat {
                    sample_rate: 48_000,
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
            .expect("release gate");
    }

    fn process(
        &mut self,
        header: Option<(i64, MetaHeaderFlags)>,
        memory: Option<&[u8]>,
        offset: u32,
        size: u32,
    ) {
        process_audio_buffer(
            &mut self.state,
            header,
            Some(AudioChunk {
                offset,
                size,
                memory,
            }),
        );
    }

    fn queued_bytes(&self) -> usize {
        self.state.queued_bytes.load(Ordering::Acquire)
    }
}

fn stereo_frame(left: f32, right: f32) -> [u8; 8] {
    let mut bytes = [0; 8];
    bytes[..4].copy_from_slice(&left.to_le_bytes());
    bytes[4..].copy_from_slice(&right.to_le_bytes());
    bytes
}

#[test]
fn inactive_unformatted_and_unstarted_callbacks_leave_all_state_untouched() {
    let bytes = stereo_frame(0.25, -0.5);
    for blocked in 0..3 {
        let mut fixture = BufferFixture::new(2, 16);
        match blocked {
            0 => fixture.state.active = false,
            1 => {
                fixture.start();
                fixture.state.format = None;
            }
            _ => {}
        }
        fixture.process(Some((100, MetaHeaderFlags::empty())), Some(&bytes), 0, 8);
        assert!(fixture.packets.is_empty());
        assert!(fixture.events.is_empty());
        assert!(fixture.failures.is_empty());
        assert_eq!(fixture.state.next_sample, 0);
        assert_eq!(fixture.state.last_native_timestamp_ns, None);
        assert_eq!(fixture.queued_bytes(), 0);
    }
}

#[test]
fn missing_chunk_records_valid_header_but_does_not_advance_samples() {
    let mut fixture = BufferFixture::new(2, 16);
    fixture.start();
    process_audio_buffer(
        &mut fixture.state,
        Some((123, MetaHeaderFlags::empty())),
        None,
    );
    assert_eq!(fixture.state.last_native_timestamp_ns, Some(123));
    assert_eq!(fixture.state.next_sample, 0);
    assert!(fixture.packets.is_empty());
    assert!(fixture.events.is_empty());
    assert!(fixture.failures.is_empty());
}

#[test]
fn empty_and_partial_chunks_are_skipped_without_failure() {
    let mut fixture = BufferFixture::new(2, 16);
    fixture.start();
    let bytes = stereo_frame(0.25, -0.5);
    fixture.process(None, Some(&bytes), 0, 0);
    fixture.process(None, Some(&bytes), 0, 7);
    fixture.state.format.as_mut().expect("format").channels = 0;
    fixture.process(None, Some(&bytes), 0, 8);
    assert!(fixture.packets.is_empty());
    assert!(fixture.failures.is_empty());
    assert_eq!(fixture.state.next_sample, 0);
    assert_eq!(fixture.queued_bytes(), 0);
}

#[test]
fn missing_memory_and_out_of_bounds_chunks_report_terminal_failure() {
    let bytes = stereo_frame(0.25, -0.5);
    for (memory, offset, size) in [
        (None, 0, 8),
        (Some(bytes.as_slice()), 4, 8),
        (Some(bytes.as_slice()), u32::MAX, 8),
    ] {
        let mut fixture = BufferFixture::new(2, 16);
        fixture.start();
        fixture.process(None, memory, offset, size);
        assert!(matches!(
            fixture.failures.try_recv(),
            Ok(AudioEvent::Failed(message)) if message.contains("buffer is invalid")
        ));
        assert!(fixture.packets.is_empty());
        assert_eq!(fixture.state.next_sample, 0);
        assert_eq!(fixture.queued_bytes(), 0);
    }
}

#[test]
fn valid_offset_and_two_frames_preserve_samples_and_native_timestamp() {
    let mut fixture = BufferFixture::new(2, 32);
    fixture.start();
    let mut memory = vec![99; 4];
    memory.extend_from_slice(&stereo_frame(0.25, -0.5));
    memory.extend_from_slice(&stereo_frame(0.75, -1.0));
    fixture.process(
        Some((1_000, MetaHeaderFlags::empty())),
        Some(&memory),
        4,
        16,
    );
    let packet = fixture.packets.try_recv().expect("two stereo frames");
    assert_eq!(packet.first_sample, 0);
    assert_eq!(packet.native_capture_ns, Some(1_000));
    assert_eq!(packet.packet.channels, 2);
    assert_eq!(packet.packet.sample_rate, 48_000);
    assert_eq!(packet.packet.frames, 2);
    assert_eq!(packet.packet.data, [0.25, -0.5, 0.75, -1.0]);
    assert_eq!(fixture.state.next_sample, 2);
    assert_eq!(fixture.queued_bytes(), 16);
    assert!(fixture.events.is_empty());
}

#[test]
fn regressing_header_invalidates_native_timestamps_once_and_keeps_packets() {
    let mut fixture = BufferFixture::new(4, 32);
    fixture.start();
    let bytes = stereo_frame(0.25, -0.5);
    fixture.process(Some((100, MetaHeaderFlags::empty())), Some(&bytes), 0, 8);
    fixture.process(Some((99, MetaHeaderFlags::empty())), Some(&bytes), 0, 8);
    fixture.process(Some((101, MetaHeaderFlags::empty())), Some(&bytes), 0, 8);
    assert_eq!(
        fixture.packets.try_recv().expect("first").native_capture_ns,
        Some(100)
    );
    assert_eq!(
        fixture
            .packets
            .try_recv()
            .expect("second")
            .native_capture_ns,
        None
    );
    assert_eq!(
        fixture.packets.try_recv().expect("third").native_capture_ns,
        None
    );
    assert_eq!(fixture.state.next_sample, 3);
    assert!(fixture.state.native_timestamps_invalidated);
    assert!(matches!(
        fixture.events.try_recv(),
        Ok(AudioEvent::ClockDiscontinuity { first_sample: 1 })
    ));
    assert!(fixture.events.is_empty());
}

#[test]
fn discontinuity_without_chunk_emits_clock_event_at_current_sample() {
    let mut fixture = BufferFixture::new(2, 16);
    fixture.start();
    let bytes = stereo_frame(0.25, -0.5);
    fixture.process(Some((100, MetaHeaderFlags::empty())), Some(&bytes), 0, 8);
    process_audio_buffer(
        &mut fixture.state,
        Some((101, MetaHeaderFlags::DISCONT)),
        None,
    );
    assert!(matches!(
        fixture.events.try_recv(),
        Ok(AudioEvent::ClockDiscontinuity { first_sample: 1 })
    ));
    assert_eq!(fixture.state.next_sample, 1);
    assert_eq!(fixture.packets.len(), 1);
}

#[test]
fn initial_discontinuity_does_not_poison_a_later_valid_header() {
    let mut fixture = BufferFixture::new(2, 16);
    fixture.start();
    let bytes = stereo_frame(0.25, -0.5);
    fixture.process(Some((100, MetaHeaderFlags::CORRUPTED)), Some(&bytes), 0, 8);
    fixture.process(Some((101, MetaHeaderFlags::empty())), Some(&bytes), 0, 8);
    assert_eq!(
        fixture
            .packets
            .try_recv()
            .expect("corrupt")
            .native_capture_ns,
        None
    );
    assert_eq!(
        fixture.packets.try_recv().expect("valid").native_capture_ns,
        Some(101)
    );
    assert!(fixture.events.is_empty());
    assert!(!fixture.state.native_timestamps_invalidated);
}

#[test]
fn byte_limit_and_full_packet_queue_drop_without_losing_sample_position() {
    let bytes = stereo_frame(0.25, -0.5);
    for (packet_capacity, byte_limit) in [(2, 8), (1, 16)] {
        let mut fixture = BufferFixture::new(packet_capacity, byte_limit);
        fixture.start();
        fixture.process(None, Some(&bytes), 0, 8);
        fixture.process(None, Some(&bytes), 0, 8);
        assert_eq!(fixture.packets.len(), 1);
        assert_eq!(fixture.state.next_sample, 2);
        assert_eq!(fixture.queued_bytes(), 8);
        assert!(matches!(
            fixture.events.try_recv(),
            Ok(AudioEvent::Dropped {
                first_sample: 1,
                frames: 1
            })
        ));
        assert!(fixture.failures.is_empty());
    }
}

#[test]
fn disconnected_packet_consumer_releases_reservation_and_reports_failure() {
    let mut fixture = BufferFixture::new(1, 8);
    fixture.start();
    drop(std::mem::replace(
        &mut fixture.packets,
        crossbeam_channel::never(),
    ));
    let bytes = stereo_frame(0.25, -0.5);
    fixture.process(None, Some(&bytes), 0, 8);
    assert_eq!(fixture.state.next_sample, 1);
    assert_eq!(fixture.queued_bytes(), 0);
    assert!(matches!(
        fixture.failures.try_recv(),
        Ok(AudioEvent::Failed(message)) if message.contains("consumer disconnected")
    ));
}

#[test]
fn invalid_sample_rate_and_sample_counter_overflow_do_not_publish() {
    let bytes = stereo_frame(0.25, -0.5);
    for overflow in [false, true] {
        let mut fixture = BufferFixture::new(1, 8);
        fixture.start();
        if overflow {
            fixture.state.next_sample = u64::MAX;
        } else {
            fixture.state.format.as_mut().expect("format").sample_rate = 0;
        }
        fixture.process(None, Some(&bytes), 0, 8);
        assert!(fixture.packets.is_empty());
        assert_eq!(fixture.queued_bytes(), 0);
        assert_eq!(
            fixture.state.next_sample,
            if overflow { u64::MAX } else { 0 }
        );
    }
}

#[test]
fn invalid_buffer_preserves_an_existing_terminal_failure() {
    let mut fixture = BufferFixture::new(1, 8);
    fixture.start();
    fixture
        .state
        .terminal_tx
        .try_send(AudioEvent::Failed("earlier failure".into()))
        .expect("fill terminal channel");
    fixture.process(None, None, 0, 8);
    assert!(matches!(
        fixture.failures.try_recv(),
        Ok(AudioEvent::Failed(reason)) if reason == "earlier failure"
    ));
    assert!(fixture.failures.is_empty());
    assert!(fixture.packets.is_empty());
    assert_eq!(fixture.state.next_sample, 0);
    assert_eq!(fixture.queued_bytes(), 0);
}

#[test]
fn disconnected_event_receiver_does_not_block_dropped_packets_or_clock_updates() {
    let mut fixture = BufferFixture::new(1, 0);
    fixture.start();
    drop(std::mem::replace(
        &mut fixture.events,
        crossbeam_channel::never(),
    ));
    let frame = stereo_frame(0.25, -0.5);
    fixture.process(Some((100, MetaHeaderFlags::empty())), Some(&frame), 0, 8);
    fixture.process(Some((101, MetaHeaderFlags::DISCONT)), Some(&frame), 0, 8);
    assert_eq!(fixture.state.next_sample, 2);
    assert_eq!(fixture.state.last_native_timestamp_ns, Some(100));
    assert!(fixture.state.native_timestamps_invalidated);
    assert_eq!(fixture.queued_bytes(), 0);
    assert!(fixture.packets.is_empty());
    assert!(fixture.failures.is_empty());
}

#[test]
fn full_event_channel_does_not_block_discontinuity_or_packet_delivery() {
    let mut fixture = BufferFixture::new(2, 16);
    fixture.start();
    let frame = stereo_frame(0.25, -0.5);
    fixture.process(Some((100, MetaHeaderFlags::empty())), Some(&frame), 0, 8);
    for sample in 0..4 {
        fixture
            .state
            .event_tx
            .try_send(AudioEvent::Dropped {
                first_sample: sample,
                frames: 1,
            })
            .expect("fill event queue");
    }
    fixture.process(Some((101, MetaHeaderFlags::CORRUPTED)), Some(&frame), 0, 8);
    let first = fixture.packets.try_recv().expect("first packet");
    let second = fixture.packets.try_recv().expect("second packet");
    assert_eq!(first.native_capture_ns, Some(100));
    assert_eq!(second.native_capture_ns, None);
    assert_eq!(second.first_sample, 1);
    assert_eq!(fixture.state.next_sample, 2);
    assert!(fixture.state.native_timestamps_invalidated);
    assert_eq!(fixture.events.len(), 4);
    assert!(fixture.failures.is_empty());
}

#[test]
fn mono_chunk_is_accepted_and_channel_change_is_reflected_in_packet() {
    let mut fixture = BufferFixture::new(1, 8);
    fixture.start();
    fixture.state.format = Some(NegotiatedFormat {
        sample_rate: 48_000,
        channels: 1,
    });
    let sample = 0.75_f32.to_le_bytes();
    fixture.process(Some((0, MetaHeaderFlags::empty())), Some(&sample), 0, 4);
    let packet = fixture.packets.try_recv().expect("mono packet");
    assert_eq!(packet.packet.channels, 1);
    assert_eq!(packet.packet.frames, 1);
    assert_eq!(packet.packet.data, [0.75]);
    assert_eq!(packet.native_capture_ns, Some(0));
    assert_eq!(fixture.queued_bytes(), 4);
}

#[test]
fn malformed_chunk_after_valid_header_preserves_clock_without_advancing_samples() {
    let mut fixture = BufferFixture::new(1, 8);
    fixture.start();
    fixture.process(Some((300, MetaHeaderFlags::empty())), None, 0, 8);
    assert_eq!(fixture.state.last_native_timestamp_ns, Some(300));
    assert_eq!(fixture.state.next_sample, 0);
    assert!(matches!(
        fixture.failures.try_recv(),
        Ok(AudioEvent::Failed(_))
    ));

    let frame = stereo_frame(0.25, -0.5);
    fixture.process(Some((301, MetaHeaderFlags::empty())), Some(&frame), 0, 8);
    let packet = fixture.packets.try_recv().expect("next valid packet");
    assert_eq!(packet.first_sample, 0);
    assert_eq!(packet.native_capture_ns, Some(301));
    assert_eq!(fixture.state.next_sample, 1);
    assert_eq!(fixture.queued_bytes(), 8);
}

#[test]
fn closed_terminal_receiver_does_not_change_state_for_invalid_memory() {
    let mut fixture = BufferFixture::new(1, 8);
    fixture.start();
    drop(std::mem::replace(
        &mut fixture.failures,
        crossbeam_channel::never(),
    ));
    fixture.process(Some((400, MetaHeaderFlags::empty())), None, 0, 8);
    assert_eq!(fixture.state.last_native_timestamp_ns, Some(400));
    assert_eq!(fixture.state.next_sample, 0);
    assert_eq!(fixture.queued_bytes(), 0);
    assert!(fixture.packets.is_empty());
    assert!(fixture.events.is_empty());
}
