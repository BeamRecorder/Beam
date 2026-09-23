#![cfg(test)]
#![allow(clippy::expect_used)]

use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

use beam_media_core::{LatestFrame, MonotonicClock, SessionClock, StartGate};
use crossbeam_channel::Receiver;

use super::{CapturedFrame, DispatchPorts, FrameDispatcher};
use crate::{CameraError, CameraEvent, CameraFormat, PixelFormat};

struct Harness {
    dispatch: FrameDispatcher,
    frames: Receiver<CapturedFrame>,
    events: Receiver<CameraEvent>,
    latest: Arc<LatestFrame<CapturedFrame>>,
    queued_bytes: Arc<AtomicUsize>,
    gate: Arc<StartGate>,
    clock: SessionClock,
}

fn harness(capacity: usize, byte_limit: usize) -> Harness {
    let format = CameraFormat {
        width: 1,
        height: 1,
        fps: 30,
        pixel_format: PixelFormat::Bgra,
        stride: 4,
    };
    let (frame_tx, frames) = crossbeam_channel::bounded(capacity);
    let (event_tx, events) = crossbeam_channel::bounded(16);
    let latest = Arc::new(LatestFrame::new());
    let queued_bytes = Arc::new(AtomicUsize::new(0));
    let clock = SessionClock::start();
    let gate = Arc::new(StartGate::new());
    let dispatch = FrameDispatcher::new(
        format,
        clock.clone(),
        gate.clone(),
        DispatchPorts {
            frame_tx,
            event_tx,
            latest: latest.clone(),
            queued_bytes: queued_bytes.clone(),
            byte_limit,
        },
    );
    Harness {
        dispatch,
        frames,
        events,
        latest,
        queued_bytes,
        gate,
        clock,
    }
}

fn start(harness: &Harness) {
    harness
        .gate
        .release(harness.clock.now_ns())
        .expect("release gate");
}

#[test]
fn frame_dispatch_waits_for_gate_and_copies_only_bytes_used() {
    let mut test = harness(2, 8);
    test.dispatch.started();
    assert!(matches!(test.events.try_recv(), Ok(CameraEvent::Started)));
    test.dispatch
        .dispatch(&[1, 2, 3, 4, 5], 1, 4, false, None)
        .expect("before start");
    assert!(test.frames.try_recv().is_err());
    assert_eq!(
        test.latest
            .take()
            .expect("armed preview")
            .data
            .data
            .as_ref(),
        &[1, 2, 3, 4]
    );
    assert_eq!(test.queued_bytes.load(Ordering::Acquire), 0);

    start(&test);
    test.dispatch
        .dispatch(&[1, 2, 3, 4, 5], 2, 99, false, None)
        .expect("first frame");
    let recorded = test.frames.try_recv().expect("recording frame");
    let preview = test.latest.take().expect("preview frame");
    assert_eq!(recorded.data.data.as_ref(), &[1, 2, 3, 4, 5]);
    assert_eq!(preview.data.sequence, 2);
    assert_eq!(test.queued_bytes.load(Ordering::Acquire), 5);
    assert!(test.events.try_recv().is_err());
}

#[test]
fn driver_error_drops_frame_without_touching_preview_or_queue() {
    let mut test = harness(1, 4);
    start(&test);
    test.dispatch
        .dispatch(&[1, 2, 3, 4], 7, 4, true, Some(1_000_000_000))
        .expect("driver error");
    assert!(test.frames.try_recv().is_err());
    assert!(test.latest.take().is_none());
    assert_eq!(test.queued_bytes.load(Ordering::Acquire), 0);
    assert!(matches!(
        test.events.try_recv(),
        Ok(CameraEvent::Dropped { sequence: 7 })
    ));
}

#[test]
fn byte_budget_drop_keeps_live_preview_and_does_not_reserve_bytes() {
    let mut test = harness(2, 3);
    start(&test);
    test.dispatch
        .dispatch(&[1, 2, 3, 4], 8, 4, false, None)
        .expect("oversized frame");
    assert!(test.frames.try_recv().is_err());
    assert_eq!(test.latest.take().expect("preview").data.sequence, 8);
    assert_eq!(test.queued_bytes.load(Ordering::Acquire), 0);
    assert!(matches!(
        test.events.try_recv(),
        Ok(CameraEvent::Dropped { sequence: 8 })
    ));
}

#[test]
fn full_recording_queue_drops_new_frame_but_updates_latest_preview() {
    let mut test = harness(1, 8);
    start(&test);
    test.dispatch
        .dispatch(&[1, 2, 3, 4], 1, 4, false, None)
        .expect("first frame");
    test.dispatch
        .dispatch(&[5, 6, 7, 8], 2, 4, false, None)
        .expect("second frame");
    assert_eq!(test.frames.try_recv().expect("recording").data.sequence, 1);
    assert_eq!(test.latest.take().expect("preview").data.sequence, 2);
    assert_eq!(test.queued_bytes.load(Ordering::Acquire), 4);
    assert!(matches!(
        test.events.try_recv(),
        Ok(CameraEvent::Dropped { sequence: 2 })
    ));
}

#[test]
fn disconnected_recording_consumer_releases_byte_reservation() {
    let mut test = harness(1, 4);
    start(&test);
    drop(test.frames);
    let result = test.dispatch.dispatch(&[1, 2, 3, 4], 1, 4, false, None);
    assert!(
        matches!(result, Err(CameraError::Backend(reason)) if reason.contains("consumer disconnected"))
    );
    assert_eq!(test.queued_bytes.load(Ordering::Acquire), 0);
    assert_eq!(test.latest.take().expect("preview").data.sequence, 1);
}

#[test]
fn regressing_native_timestamp_reports_discontinuity_and_keeps_pts_monotonic() {
    let mut test = harness(4, 16);
    start(&test);
    for (sequence, native) in [(1, 1_000_000_000), (2, 1_033_000_000), (3, 900_000_000)] {
        test.dispatch
            .dispatch(&[1, 2, 3, 4], sequence, 4, false, Some(native))
            .expect("frame");
    }
    let first = test.frames.try_recv().expect("first frame");
    let second = test.frames.try_recv().expect("second frame");
    let third = test.frames.try_recv().expect("third frame");
    assert!(first.captured_ns < second.captured_ns);
    assert!(second.captured_ns < third.captured_ns);
    assert_eq!(third.data.native_timestamp_ns, Some(900_000_000));
    assert!(matches!(
        test.events.try_recv(),
        Ok(CameraEvent::ClockDiscontinuity { sequence: 3 })
    ));
}

#[test]
fn closed_gate_stops_recording_but_keeps_preview() {
    let mut test = harness(2, 8);
    start(&test);
    test.gate.close();
    test.dispatch
        .dispatch(&[1, 2, 3, 4], 4, 4, false, Some(1_000_000_000))
        .expect("frame after stop");
    assert!(test.frames.try_recv().is_err());
    assert_eq!(test.latest.take().expect("preview").data.sequence, 4);
    assert_eq!(test.queued_bytes.load(Ordering::Acquire), 0);
}

#[test]
fn byte_counter_overflow_drops_frame_without_wrapping_or_hiding_preview() {
    let mut test = harness(1, usize::MAX);
    start(&test);
    test.queued_bytes.store(usize::MAX, Ordering::Release);
    test.dispatch
        .dispatch(&[1, 2, 3, 4], 42, 4, false, None)
        .expect("counter overflow is a dropped frame");
    assert_eq!(test.queued_bytes.load(Ordering::Acquire), usize::MAX);
    assert!(test.frames.try_recv().is_err());
    assert_eq!(test.latest.take().expect("preview").data.sequence, 42);
    assert!(matches!(
        test.events.try_recv(),
        Ok(CameraEvent::Dropped { sequence: 42 })
    ));
}

#[test]
fn zero_bytes_used_publishes_an_empty_owned_frame_without_reservation() {
    let mut test = harness(1, 4);
    start(&test);
    test.dispatch
        .dispatch(&[1, 2, 3, 4], 12, 0, false, None)
        .expect("zero byte frame");
    let frame = test.frames.try_recv().expect("frame");
    assert!(frame.data.data.is_empty());
    assert_eq!(frame.data.sequence, 12);
    assert_eq!(test.queued_bytes.load(Ordering::Acquire), 0);
    assert_eq!(test.latest.take().expect("preview").data.data.len(), 0);
}

#[test]
fn large_forward_clock_jump_preserves_native_delta_without_false_discontinuity() {
    let mut test = harness(2, 8);
    start(&test);
    test.dispatch
        .dispatch(&[1, 2, 3, 4], 1, 4, false, Some(1_000_000_000))
        .expect("first native frame");
    test.dispatch
        .dispatch(&[1, 2, 3, 4], 2, 4, false, Some(10_000_000_000))
        .expect("jumped native frame");
    let first = test.frames.try_recv().expect("first frame");
    let second = test.frames.try_recv().expect("second frame");
    assert_eq!(second.captured_ns - first.captured_ns, 9_000_000_000);
    assert!(test.events.try_recv().is_err());
}

#[test]
fn saturated_event_queue_never_blocks_started_drop_or_clock_recovery() {
    let mut test = harness(2, 8);
    let (event_tx, events) = crossbeam_channel::bounded(0);
    test.dispatch.ports.event_tx = event_tx;
    drop(events);
    test.dispatch.started();
    start(&test);
    test.dispatch
        .dispatch(&[1, 2, 3, 4], 1, 4, true, None)
        .expect("drop with no event consumer");
    test.dispatch
        .dispatch(&[1, 2, 3, 4], 2, 4, false, Some(1_000_000_000))
        .expect("native timestamp");
    test.dispatch
        .dispatch(&[1, 2, 3, 4], 3, 4, false, Some(900_000_000))
        .expect("clock reset with no event consumer");
    assert_eq!(test.frames.try_recv().expect("first").data.sequence, 2);
    assert_eq!(test.frames.try_recv().expect("second").data.sequence, 3);
}

#[test]
fn resume_reanchors_camera_native_clock_without_pause_gap() {
    let mut test = harness(8, 32);
    start(&test);
    test.dispatch
        .dispatch(&[1, 2, 3, 4], 1, 4, false, Some(1_000_000))
        .expect("first");
    let first = test.frames.recv().expect("first frame");
    test.gate.pause(test.clock.now_ns()).expect("pause");
    test.dispatch
        .dispatch(&[1, 2, 3, 4], 2, 4, false, Some(5_000_000_000))
        .expect("paused");
    assert!(test.frames.try_recv().is_err());
    test.gate.resume(test.clock.now_ns()).expect("resume");
    test.dispatch
        .dispatch(&[1, 2, 3, 4], 3, 4, false, Some(10_000_000_000))
        .expect("resumed");
    let resumed = test.frames.recv().expect("resumed frame");
    assert!(resumed.captured_ns > first.captured_ns);
    assert!(resumed.captured_ns < 1_000_000_000);
}
