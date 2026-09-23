#![cfg(test)]
#![allow(clippy::expect_used)]

use super::super::process::process_bytes;
use super::*;
use beam_media_core::{AudioPacket, MonotonicClock};
use std::sync::atomic::Ordering;

struct Fixture {
    state: ProcessState,
    packets: Receiver<TimedAudioPacket>,
    events: Receiver<AudioEvent>,
    terminal_events: Receiver<AudioEvent>,
}

impl Fixture {
    fn new(byte_limit: usize, packet_limit: usize) -> Self {
        let (packet_tx, packets) = crossbeam_channel::bounded(packet_limit);
        let (event_tx, events) = crossbeam_channel::bounded(16);
        let (terminal_tx, terminal_events) = crossbeam_channel::bounded(1);
        Self {
            state: ProcessState {
                format: Some(NegotiatedFormat {
                    sample_rate: 48_000,
                    channels: 2,
                }),
                clock: SessionClock::start(),
                gate: Arc::new(StartGate::new()),
                sample_clock: None,
                gate_epoch: 0,
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
            terminal_events,
        }
    }

    fn start(&self) {
        self.state
            .gate
            .release(self.state.clock.now_ns())
            .expect("start system audio");
    }

    fn process(&mut self, samples: &[f32]) {
        self.process_at(samples, None);
    }

    fn process_at(&mut self, samples: &[f32], native_capture_ns: Option<u64>) {
        let bytes: Vec<u8> = samples
            .iter()
            .flat_map(|sample| sample.to_le_bytes())
            .collect();
        process_bytes(
            &mut self.state,
            NegotiatedFormat {
                sample_rate: 48_000,
                channels: 2,
            },
            u32::try_from(samples.len() / 2).expect("small test packet"),
            &bytes,
            native_capture_ns,
        );
    }
}

#[test]
fn valid_pipewire_header_pts_reaches_the_shared_audio_packet() {
    let mut fixture = Fixture::new(1024, 2);
    fixture.start();
    fixture.process_at(&[0.25, -0.5], Some(12_345));
    let packet = fixture.packets.try_recv().expect("packet");
    assert_eq!(packet.native_capture_ns, Some(12_345));
}

#[test]
fn pipewire_packets_keep_samples_and_positions_after_the_shared_start() {
    let mut fixture = Fixture::new(1024, 2);
    fixture.process(&[0.25, -0.5]);
    assert!(fixture.packets.is_empty());
    fixture.start();
    fixture.process(&[0.25, -0.5]);
    fixture.process(&[0.75, 0.0]);
    let first = fixture.packets.try_recv().expect("first packet");
    let second = fixture.packets.try_recv().expect("second packet");
    assert_eq!(first.packet.data, [0.25, -0.5]);
    assert_eq!(first.first_sample, 0);
    assert_eq!(second.packet.data, [0.75, 0.0]);
    assert_eq!(second.first_sample, 1);
    assert!(second.packet.start_ns >= first.packet.start_ns);
    assert_eq!(fixture.state.queued_bytes.load(Ordering::Acquire), 16);
}

#[test]
fn pipewire_byte_and_packet_limits_drop_without_blocking_the_callback() {
    let mut byte_limited = Fixture::new(4, 1);
    byte_limited.start();
    byte_limited.process(&[0.0, 0.0]);
    assert!(byte_limited.packets.is_empty());
    assert!(matches!(
        byte_limited.events.try_recv(),
        Ok(AudioEvent::Dropped {
            first_sample: 0,
            frames: 1
        })
    ));
    assert_eq!(byte_limited.state.next_sample, 1);
    assert_eq!(byte_limited.state.queued_bytes.load(Ordering::Acquire), 0);

    let mut packet_limited = Fixture::new(1024, 1);
    packet_limited.start();
    packet_limited.process(&[0.0, 0.0]);
    packet_limited.process(&[0.5, 0.5]);
    assert_eq!(packet_limited.state.next_sample, 2);
    assert_eq!(packet_limited.state.queued_bytes.load(Ordering::Acquire), 8);
    assert!(matches!(
        packet_limited.events.try_recv(),
        Ok(AudioEvent::Dropped {
            first_sample: 1,
            frames: 1
        })
    ));
}

#[test]
fn pipewire_disconnected_consumer_releases_reserved_bytes_and_reports_failure() {
    let mut fixture = Fixture::new(1024, 1);
    fixture.start();
    let receiver = std::mem::replace(&mut fixture.packets, crossbeam_channel::never());
    drop(receiver);
    fixture.process(&[0.0, 0.0]);
    assert!(matches!(
        fixture.terminal_events.try_recv(),
        Ok(AudioEvent::Failed(_))
    ));
    assert_eq!(fixture.state.queued_bytes.load(Ordering::Acquire), 0);
}

#[test]
fn pipewire_terminal_error_precedes_saturated_drop_events() {
    let (event_tx, events) = crossbeam_channel::bounded(1);
    let (terminal_tx, terminal_events) = crossbeam_channel::bounded(1);
    event_tx
        .try_send(AudioEvent::Dropped {
            first_sample: 0,
            frames: 1,
        })
        .expect("fill regular queue");
    assert!(event_tx.try_send(AudioEvent::Started).is_err());
    terminal_tx
        .try_send(AudioEvent::Failed("PipeWire failed".into()))
        .expect("terminal event");
    let (_, packets) = crossbeam_channel::bounded(1);
    let capture = SystemAudioCapture {
        commands: None,
        worker: None,
        packets: AudioPacketQueue::new(packets, Arc::new(AtomicUsize::new(0)), "stopped"),
        events,
        terminal_events,
        sample_rate: 48_000,
        channels: 2,
    };
    assert!(matches!(capture.try_event(), Some(AudioEvent::Failed(_))));
    assert!(matches!(
        capture.try_event(),
        Some(AudioEvent::Dropped { .. })
    ));
}

#[test]
fn halting_pipewire_keeps_queued_tail_samples_available() {
    let (sender, receiver) = crossbeam_channel::bounded(2);
    let queued_bytes = Arc::new(AtomicUsize::new(8));
    sender
        .send(TimedAudioPacket {
            packet: AudioPacket {
                start_ns: 0,
                sample_rate: 48_000,
                channels: 2,
                frames: 1,
                data: vec![0.25, -0.5],
            },
            first_sample: 12,
            native_capture_ns: None,
        })
        .expect("queued packet");
    let mut capture = SystemAudioCapture {
        commands: None,
        worker: None,
        packets: AudioPacketQueue::new(receiver, queued_bytes, "stopped"),
        events: crossbeam_channel::never(),
        terminal_events: crossbeam_channel::never(),
        sample_rate: 48_000,
        channels: 2,
    };
    capture.halt().expect("halt");
    assert_eq!(capture.queue_depth(), (1, 8));
    assert_eq!(
        capture
            .try_packet()
            .expect("queued tail")
            .expect("packet")
            .first_sample,
        12
    );
    assert_eq!(capture.queue_depth(), (0, 0));
    capture.stop().expect("idempotent stop");
}

#[test]
fn absent_pipewire_worker_can_be_stopped_repeatedly() {
    let mut worker = None;
    wait_worker(&mut worker, Duration::from_millis(1)).expect("first stop");
    wait_worker(&mut worker, Duration::from_millis(1)).expect("second stop");
}

#[test]
fn timed_out_pipewire_worker_can_be_joined_after_it_returns() {
    let (release, waiting) = mpsc::sync_channel::<()>(1);
    let mut worker = Some(thread::spawn(move || {
        waiting
            .recv()
            .map_err(|error| AudioError::Backend(error.to_string()))?;
        Ok(())
    }));
    let error =
        wait_worker(&mut worker, Duration::from_millis(20)).expect_err("worker still waiting");
    assert!(error.to_string().contains("20 ms"));
    assert!(worker.is_some());
    release.send(()).expect("release worker");
    wait_worker(&mut worker, Duration::from_secs(1)).expect("retry joins worker");
    assert!(worker.is_none());
}

#[test]
fn pipewire_worker_failure_is_returned_once() {
    let mut worker = Some(thread::spawn(|| {
        Err(AudioError::Backend("stream failed".into()))
    }));
    let error = wait_worker(&mut worker, Duration::from_secs(1)).expect_err("worker failure");
    assert!(error.to_string().contains("stream failed"));
    assert!(worker.is_none());
    wait_worker(&mut worker, Duration::from_millis(1)).expect("already joined");
}

#[test]
#[allow(clippy::panic, reason = "exercise a panicked worker thread")]
fn panicked_pipewire_worker_is_reported_and_released() {
    let mut worker = Some(thread::spawn(|| -> Result<(), AudioError> {
        std::panic::panic_any("worker failed");
    }));
    let error = wait_worker(&mut worker, Duration::from_secs(1)).expect_err("worker panic");
    assert!(error.to_string().contains("PipeWire thread panicked"));
    assert!(worker.is_none());
}

#[test]
fn pipewire_capture_exposes_empty_queue_and_regular_events_without_a_worker() {
    let (_packet_tx, packets) = crossbeam_channel::bounded(1);
    let (event_tx, events) = crossbeam_channel::bounded(1);
    event_tx
        .try_send(AudioEvent::Started)
        .expect("regular event");
    let mut capture = SystemAudioCapture {
        commands: None,
        worker: None,
        packets: AudioPacketQueue::new(packets, Arc::new(AtomicUsize::new(0)), "stopped"),
        events,
        terminal_events: crossbeam_channel::never(),
        sample_rate: 48_000,
        channels: 2,
    };
    assert_eq!(capture.queue_depth(), (0, 0));
    assert!(capture.try_packet().expect("empty queue").is_none());
    assert!(
        capture
            .recv_packet_timeout(Duration::ZERO)
            .expect("empty timeout")
            .is_none()
    );
    assert!(matches!(capture.try_event(), Some(AudioEvent::Started)));
    assert!(capture.try_event().is_none());
    capture.halt().expect("no worker");
}

#[test]
fn pipewire_capture_halt_reports_worker_error_and_can_be_retried() {
    let (_packet_tx, packets) = crossbeam_channel::bounded(1);
    let worker = thread::spawn(|| Err(AudioError::Backend("stream disconnected".into())));
    let mut capture = SystemAudioCapture {
        commands: None,
        worker: Some(worker),
        packets: AudioPacketQueue::new(packets, Arc::new(AtomicUsize::new(0)), "stopped"),
        events: crossbeam_channel::never(),
        terminal_events: crossbeam_channel::never(),
        sample_rate: 48_000,
        channels: 2,
    };
    assert!(matches!(
        capture.halt(),
        Err(AudioError::Backend(reason)) if reason == "stream disconnected"
    ));
    capture.halt().expect("error consumed after join");
}

fn stereo_format() -> NegotiatedFormat {
    NegotiatedFormat {
        sample_rate: 48_000,
        channels: 2,
    }
}

#[path = "capture_listener.rs"]
mod listener_checks;

#[path = "capture_worker.rs"]
mod worker_checks;
