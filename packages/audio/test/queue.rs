#![cfg(test)]
#![allow(clippy::expect_used)]

use std::{
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

use beam_media_core::AudioPacket;

use super::*;

fn packet() -> TimedAudioPacket {
    TimedAudioPacket {
        packet: AudioPacket {
            start_ns: 12,
            sample_rate: 48_000,
            channels: 2,
            frames: 2,
            data: vec![0.0, 0.25, -0.25, 0.0],
        },
        first_sample: 44,
        native_capture_ns: Some(99),
    }
}

#[test]
fn both_receive_paths_release_the_same_byte_accounting() {
    let (sender, receiver) = crossbeam_channel::bounded(2);
    let bytes = Arc::new(AtomicUsize::new(32));
    let queue = AudioPacketQueue::new(receiver, bytes.clone(), "disconnected");
    sender.send(packet()).expect("first packet");
    sender.send(packet()).expect("second packet");
    assert_eq!(queue.depth(), (2, 32));
    assert_eq!(
        queue
            .try_packet()
            .expect("try receive")
            .expect("first queued packet")
            .first_sample,
        44
    );
    assert_eq!(queue.depth(), (1, 16));
    assert_eq!(
        queue
            .recv_packet_timeout(Duration::from_millis(1))
            .expect("timed receive")
            .expect("second queued packet")
            .packet
            .frames,
        2
    );
    assert_eq!(queue.depth(), (0, 0));
    assert_eq!(bytes.load(Ordering::Acquire), 0);
}

#[test]
fn empty_and_disconnected_producers_are_distinct() {
    let (sender, receiver) = crossbeam_channel::bounded(1);
    let queue = AudioPacketQueue::new(receiver, Arc::new(AtomicUsize::new(0)), "capture ended");
    assert!(queue.try_packet().expect("empty queue").is_none());
    assert!(
        queue
            .recv_packet_timeout(Duration::from_millis(1))
            .expect("timeout")
            .is_none()
    );
    drop(sender);
    assert!(matches!(
        queue.try_packet(),
        Err(AudioError::Backend(message)) if message == "capture ended"
    ));
    assert!(matches!(
        queue.recv_packet_timeout(Duration::from_millis(1)),
        Err(AudioError::Backend(message)) if message == "capture ended"
    ));
}

#[test]
fn closed_producer_preserves_queued_tail_before_reporting_disconnect() {
    let (sender, receiver) = crossbeam_channel::bounded(1);
    let bytes = Arc::new(AtomicUsize::new(16));
    sender.send(packet()).expect("queue final packet");
    drop(sender);
    let queue = AudioPacketQueue::new(receiver, bytes.clone(), "producer closed");
    assert_eq!(queue.depth(), (1, 16));
    let tail = queue
        .recv_packet_timeout(Duration::ZERO)
        .expect("tail remains readable")
        .expect("tail packet");
    assert_eq!(tail.first_sample, 44);
    assert_eq!(tail.packet.data, [0.0, 0.25, -0.25, 0.0]);
    assert_eq!(queue.depth(), (0, 0));
    assert!(matches!(
        queue.try_packet(),
        Err(AudioError::Backend(reason)) if reason == "producer closed"
    ));
    assert_eq!(bytes.load(Ordering::Acquire), 0);
}
