#![cfg(test)]
#![allow(clippy::expect_used)]

use std::{
    collections::VecDeque,
    io,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc,
    },
    time::Duration,
};

use beam_media_core::{LatestFrame, MonotonicClock, SessionClock, StartGate};

use super::{DispatchPorts, FrameStream, run_camera_stream};
use crate::{CameraError, CameraEvent, CameraFormat, PixelFormat};

enum Read {
    Frame(Vec<u8>, v4l::buffer::Metadata),
    Error(io::ErrorKind),
}

struct MockStream {
    reads: VecDeque<Read>,
    current: Vec<u8>,
    stop: Arc<AtomicBool>,
    timeout: Arc<Mutex<Option<Duration>>>,
}

impl FrameStream for MockStream {
    fn set_timeout(&mut self, timeout: Duration) {
        *self.timeout.lock().expect("timeout") = Some(timeout);
    }

    fn next_frame(&mut self) -> io::Result<(&[u8], v4l::buffer::Metadata)> {
        match self.reads.pop_front() {
            Some(Read::Frame(bytes, metadata)) => {
                self.current = bytes;
                if self.reads.is_empty() {
                    self.stop.store(true, Ordering::Release);
                }
                Ok((&self.current, metadata))
            }
            Some(Read::Error(kind)) => Err(io::Error::from(kind)),
            None => Err(io::Error::from(io::ErrorKind::UnexpectedEof)),
        }
    }
}

struct Harness {
    stream: MockStream,
    format: CameraFormat,
    clock: SessionClock,
    gate: Arc<StartGate>,
    ports: DispatchPorts,
    stop: Arc<AtomicBool>,
    ready: mpsc::SyncSender<Result<(), CameraError>>,
    ready_rx: mpsc::Receiver<Result<(), CameraError>>,
    frames: crossbeam_channel::Receiver<beam_media_core::VideoFrame<crate::CameraFrame>>,
    events: crossbeam_channel::Receiver<CameraEvent>,
    timeout: Arc<Mutex<Option<Duration>>>,
}

fn frame(sequence: u32, flags: v4l::buffer::Flags) -> Read {
    Read::Frame(
        vec![1, 2, 3, 4],
        v4l::buffer::Metadata {
            sequence,
            bytesused: 4,
            flags,
            ..Default::default()
        },
    )
}

fn harness(reads: Vec<Read>) -> Harness {
    let clock = SessionClock::start();
    let gate = Arc::new(StartGate::new());
    gate.release(clock.now_ns()).expect("release gate");
    let (frame_tx, frames) = crossbeam_channel::bounded(4);
    let (event_tx, events) = crossbeam_channel::bounded(8);
    let stop = Arc::new(AtomicBool::new(false));
    let timeout = Arc::new(Mutex::new(None));
    let (ready, ready_rx) = mpsc::sync_channel(1);
    Harness {
        stream: MockStream {
            reads: reads.into(),
            current: Vec::new(),
            stop: stop.clone(),
            timeout: timeout.clone(),
        },
        format: CameraFormat {
            width: 1,
            height: 1,
            fps: 30,
            pixel_format: PixelFormat::Bgra,
            stride: 4,
        },
        clock,
        gate,
        ports: DispatchPorts {
            frame_tx,
            event_tx,
            latest: Arc::new(LatestFrame::new()),
            queued_bytes: Arc::new(AtomicUsize::new(0)),
            byte_limit: 16,
        },
        stop,
        ready,
        ready_rx,
        frames,
        events,
        timeout,
    }
}

fn run(test: Harness) -> (Result<(), CameraError>, HarnessResults) {
    let Harness {
        stream,
        format,
        clock,
        gate,
        ports,
        stop,
        ready,
        ready_rx,
        frames,
        events,
        timeout,
    } = test;
    let result = run_camera_stream(stream, format, clock, gate, ports, stop, ready);
    (
        result,
        HarnessResults {
            ready_rx,
            frames,
            events,
            timeout,
        },
    )
}

struct HarnessResults {
    ready_rx: mpsc::Receiver<Result<(), CameraError>>,
    frames: crossbeam_channel::Receiver<beam_media_core::VideoFrame<crate::CameraFrame>>,
    events: crossbeam_channel::Receiver<CameraEvent>,
    timeout: Arc<Mutex<Option<Duration>>>,
}

#[test]
fn stream_announces_ready_and_started_before_delivering_a_frame() {
    let (result, output) = run(harness(vec![frame(7, v4l::buffer::Flags::empty())]));
    assert!(result.is_ok());
    assert!(matches!(output.ready_rx.try_recv(), Ok(Ok(()))));
    assert!(matches!(output.events.try_recv(), Ok(CameraEvent::Started)));
    assert_eq!(output.frames.try_recv().expect("frame").data.sequence, 7);
    assert_eq!(
        *output.timeout.lock().expect("timeout"),
        Some(Duration::from_millis(250))
    );
}

#[test]
fn timeout_and_would_block_are_retried_before_a_valid_frame() {
    let (result, output) = run(harness(vec![
        Read::Error(io::ErrorKind::TimedOut),
        Read::Error(io::ErrorKind::WouldBlock),
        frame(8, v4l::buffer::Flags::empty()),
    ]));
    assert!(result.is_ok());
    assert_eq!(
        output
            .frames
            .try_recv()
            .expect("retried frame")
            .data
            .sequence,
        8
    );
    assert!(matches!(output.events.try_recv(), Ok(CameraEvent::Started)));
    assert!(output.events.try_recv().is_err());
}

#[test]
fn fatal_read_error_is_reported_after_ready_without_fake_frames() {
    let (result, output) = run(harness(vec![Read::Error(io::ErrorKind::BrokenPipe)]));
    assert!(matches!(result, Err(CameraError::DeviceUnavailable(_))));
    assert!(matches!(output.ready_rx.try_recv(), Ok(Ok(()))));
    assert!(output.frames.try_recv().is_err());
}

#[test]
fn v4l2_buffer_error_emits_drop_and_does_not_publish_bad_frame() {
    let (result, output) = run(harness(vec![frame(9, v4l::buffer::Flags::ERROR)]));
    assert!(result.is_ok());
    assert!(matches!(output.events.try_recv(), Ok(CameraEvent::Started)));
    assert!(matches!(
        output.events.try_recv(),
        Ok(CameraEvent::Dropped { sequence: 9 })
    ));
    assert!(output.frames.try_recv().is_err());
}

#[test]
fn stop_before_first_read_exits_without_touching_the_stream() {
    let test = harness(vec![]);
    test.stop.store(true, Ordering::Release);
    let (result, output) = run(test);
    assert!(result.is_ok());
    assert!(matches!(output.ready_rx.try_recv(), Ok(Ok(()))));
    assert!(matches!(output.events.try_recv(), Ok(CameraEvent::Started)));
    assert!(output.frames.try_recv().is_err());
}

#[test]
fn permission_denial_during_stream_read_retains_its_error_kind() {
    let (result, output) = run(harness(vec![Read::Error(io::ErrorKind::PermissionDenied)]));
    assert!(matches!(result, Err(CameraError::PermissionDenied(_))));
    assert!(matches!(output.ready_rx.try_recv(), Ok(Ok(()))));
    assert!(matches!(output.events.try_recv(), Ok(CameraEvent::Started)));
    assert!(output.frames.try_recv().is_err());
}

#[test]
fn exhausted_stream_is_reported_as_disconnection_after_a_recoverable_timeout() {
    let (result, output) = run(harness(vec![Read::Error(io::ErrorKind::TimedOut)]));
    assert!(matches!(result, Err(CameraError::DeviceUnavailable(_))));
    assert!(matches!(output.ready_rx.try_recv(), Ok(Ok(()))));
    assert!(output.frames.try_recv().is_err());
}

#[test]
fn metadata_bytes_used_limits_recorded_data_and_propagates_native_timestamp() {
    let mut metadata = v4l::buffer::Metadata {
        sequence: 23,
        bytesused: 2,
        timestamp: v4l::timestamp::Timestamp::new(12, 345),
        ..Default::default()
    };
    metadata.flags = v4l::buffer::Flags::TIMESTAMP_MONOTONIC;
    let (result, output) = run(harness(vec![Read::Frame(vec![1, 2, 3, 4], metadata)]));
    assert!(result.is_ok());
    let frame = output.frames.try_recv().expect("recorded frame");
    assert_eq!(frame.data.data.as_ref(), &[1, 2]);
    assert_eq!(frame.data.sequence, 23);
    assert_eq!(frame.data.native_timestamp_ns, Some(12_000_345_000));
    assert!(frame.captured_ns > 0);
}

#[test]
fn closed_gate_ignores_an_arriving_stream_frame() {
    let test = harness(vec![frame(24, v4l::buffer::Flags::empty())]);
    test.gate.close();
    let (result, output) = run(test);
    assert!(result.is_ok());
    assert!(output.frames.try_recv().is_err());
    assert!(matches!(output.events.try_recv(), Ok(CameraEvent::Started)));
}

#[test]
fn disconnected_recording_consumer_stops_stream_with_backend_error() {
    let test = harness(vec![frame(25, v4l::buffer::Flags::empty())]);
    drop(test.frames);
    let result = run_camera_stream(
        test.stream,
        test.format,
        test.clock,
        test.gate,
        test.ports,
        test.stop,
        test.ready,
    );
    assert!(matches!(
        result,
        Err(CameraError::Backend(message)) if message.contains("consumer disconnected")
    ));
}
