#![cfg(test)]
#![allow(clippy::expect_used)]

use std::{
    io,
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use beam_media_core::{MonotonicClock, SessionClock, StartGate};

use super::{CameraBackend, FrameStream, open_device};
use crate::{CameraError, CameraEvent, CameraQueueLimits, CameraRequest, PixelFormat};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Failure {
    Formats,
    Format,
    Params,
    Stream,
}

struct MockBackend {
    failure: Option<Failure>,
    error_kind: io::ErrorKind,
    formats: Vec<v4l::FourCC>,
    selected_fourcc: Option<v4l::FourCC>,
    fps: u32,
    calls: Arc<Mutex<Vec<&'static str>>>,
}

impl Default for MockBackend {
    fn default() -> Self {
        Self {
            failure: None,
            error_kind: io::ErrorKind::BrokenPipe,
            formats: vec![v4l::FourCC::new(b"BGRA")],
            selected_fourcc: None,
            fps: 30,
            calls: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

impl MockBackend {
    fn record(&self, call: &'static str) {
        self.calls.lock().expect("calls").push(call);
    }

    fn fail(&self, stage: Failure) -> io::Result<()> {
        if self.failure == Some(stage) {
            Err(io::Error::from(self.error_kind))
        } else {
            Ok(())
        }
    }
}

struct IdleStream;

impl FrameStream for IdleStream {
    fn set_timeout(&mut self, _timeout: Duration) {}

    fn next_frame(&mut self) -> io::Result<(&[u8], v4l::buffer::Metadata)> {
        thread::sleep(Duration::from_millis(1));
        Err(io::Error::from(io::ErrorKind::TimedOut))
    }
}

impl CameraBackend for MockBackend {
    type Stream<'a> = IdleStream;

    fn formats(&self) -> io::Result<Vec<v4l::FourCC>> {
        self.record("formats");
        self.fail(Failure::Formats)?;
        Ok(self.formats.clone())
    }

    fn negotiate_format(&self, requested: &v4l::Format) -> io::Result<v4l::Format> {
        self.record("format");
        self.fail(Failure::Format)?;
        let mut selected = *requested;
        selected.fourcc = self.selected_fourcc.unwrap_or(requested.fourcc);
        selected.stride = requested.width * 4;
        Ok(selected)
    }

    fn negotiate_params(
        &self,
        _requested: &v4l::video::capture::Parameters,
    ) -> io::Result<v4l::video::capture::Parameters> {
        self.record("params");
        self.fail(Failure::Params)?;
        Ok(v4l::video::capture::Parameters::with_fps(self.fps))
    }

    fn open_stream(&self) -> io::Result<Self::Stream<'_>> {
        self.record("stream");
        self.fail(Failure::Stream)?;
        Ok(IdleStream)
    }
}

fn open(backend: MockBackend) -> Result<super::CameraCapture, CameraError> {
    let clock = SessionClock::start();
    let gate = Arc::new(StartGate::new());
    gate.release(clock.now_ns()).expect("release gate");
    open_device(
        backend,
        CameraRequest {
            device_id: "mock".into(),
            width: 2,
            height: 2,
            fps: 30,
        },
        clock,
        gate,
        CameraQueueLimits {
            frames: 2,
            bytes: 32,
        },
    )
}

#[test]
fn mock_backend_negotiates_and_starts_without_camera_hardware() {
    let backend = MockBackend::default();
    let calls = backend.calls.clone();
    let mut capture = open(backend).expect("open mock camera");
    assert_eq!(capture.format.width, 2);
    assert_eq!(capture.format.height, 2);
    assert_eq!(capture.format.fps, 30);
    assert_eq!(capture.format.stride, 8);
    assert_eq!(capture.format.pixel_format, PixelFormat::Bgra);
    capture.halt().expect("stop mock camera");
    assert!(matches!(capture.try_event(), Some(CameraEvent::Started)));
    assert_eq!(
        *calls.lock().expect("calls"),
        ["formats", "format", "params", "stream"]
    );
}

#[test]
fn mock_backend_rejects_unsupported_formats_before_negotiation() {
    let backend = MockBackend {
        formats: vec![v4l::FourCC::new(b"H264")],
        ..MockBackend::default()
    };
    let calls = backend.calls.clone();
    assert!(matches!(
        open(backend),
        Err(CameraError::UnsupportedFormat(_))
    ));
    assert_eq!(*calls.lock().expect("calls"), ["formats"]);
}

#[test]
fn mock_backend_rejects_a_driver_format_substitution() {
    let backend = MockBackend {
        selected_fourcc: Some(v4l::FourCC::new(b"YUYV")),
        ..MockBackend::default()
    };
    let calls = backend.calls.clone();
    assert!(matches!(
        open(backend),
        Err(CameraError::UnsupportedFormat(_))
    ));
    assert_eq!(*calls.lock().expect("calls"), ["formats", "format"]);
}

#[test]
fn mock_backend_rejects_invalid_negotiated_frame_rate() {
    let backend = MockBackend {
        fps: 0,
        ..MockBackend::default()
    };
    let calls = backend.calls.clone();
    assert!(matches!(
        open(backend),
        Err(CameraError::UnsupportedFormat(_))
    ));
    assert_eq!(
        *calls.lock().expect("calls"),
        ["formats", "format", "params"]
    );
}

#[test]
fn mock_backend_maps_format_listing_errors_and_permission_denial() {
    for (kind, permission) in [
        (io::ErrorKind::BrokenPipe, false),
        (io::ErrorKind::PermissionDenied, true),
    ] {
        let backend = MockBackend {
            failure: Some(Failure::Formats),
            error_kind: kind,
            ..MockBackend::default()
        };
        let error = open(backend).err().expect("format listing error");
        assert_eq!(
            matches!(error, CameraError::PermissionDenied(_)),
            permission
        );
    }
}

#[test]
fn mock_backend_maps_format_and_frame_rate_negotiation_errors() {
    for (failure, expected) in [
        (Failure::Format, "format negotiation"),
        (Failure::Params, "frame rate negotiation"),
    ] {
        let backend = MockBackend {
            failure: Some(failure),
            ..MockBackend::default()
        };
        assert!(
            matches!(open(backend), Err(CameraError::Backend(message)) if message.contains(expected))
        );
    }
}

#[test]
fn mock_backend_reports_stream_startup_failure_before_open_returns() {
    for (kind, permission) in [
        (io::ErrorKind::BrokenPipe, false),
        (io::ErrorKind::PermissionDenied, true),
    ] {
        let backend = MockBackend {
            failure: Some(Failure::Stream),
            error_kind: kind,
            ..MockBackend::default()
        };
        let calls = backend.calls.clone();
        let error = open(backend).err().expect("stream error");
        assert_eq!(
            matches!(error, CameraError::PermissionDenied(_)),
            permission
        );
        assert_eq!(
            *calls.lock().expect("calls"),
            ["formats", "format", "params", "stream"]
        );
    }
}
