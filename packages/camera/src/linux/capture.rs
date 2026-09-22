use std::{
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use beam_media_core::{LatestFrame, SessionClock, StartGate, VideoFrame};
use crossbeam_channel::{Receiver, Sender, TryRecvError};
use v4l::{
    Device, FourCC,
    buffer::{Flags, Type},
    io::traits::CaptureStream,
    prelude::MmapStream,
    video::Capture,
};

use crate::{
    CameraDevice, CameraError, CameraEvent, CameraFormat, CameraFrame, CameraQueueLimits,
    CameraRequest, PixelFormat,
    events::{CameraEventQueue, terminal_camera_event},
    worker::join_camera_worker,
};

use super::dispatch::{DispatchPorts, FrameDispatcher};

type CapturedFrame = VideoFrame<CameraFrame>;

pub struct CameraCapture {
    frames: Receiver<CapturedFrame>,
    events: CameraEventQueue,
    latest: Arc<LatestFrame<CapturedFrame>>,
    queued_bytes: Arc<AtomicUsize>,
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<Result<(), CameraError>>>,
    pub format: CameraFormat,
}

impl CameraCapture {
    pub fn queue_depth(&self) -> (usize, usize) {
        (self.frames.len(), self.queued_bytes.load(Ordering::Acquire))
    }

    pub fn try_frame(&self) -> Result<Option<CapturedFrame>, CameraError> {
        match self.frames.try_recv() {
            Ok(frame) => {
                self.queued_bytes
                    .fetch_sub(frame.data.data.len(), Ordering::AcqRel);
                Ok(Some(frame))
            }
            Err(TryRecvError::Empty) => Ok(None),
            Err(TryRecvError::Disconnected) => Err(CameraError::DeviceUnavailable(
                "camera capture stopped".into(),
            )),
        }
    }

    pub fn latest_preview(&self) -> Option<CapturedFrame> {
        self.latest.take()
    }

    pub fn preview_handle(&self) -> Arc<LatestFrame<CapturedFrame>> {
        self.latest.clone()
    }

    pub fn try_event(&self) -> Option<CameraEvent> {
        self.events.try_event()
    }

    pub fn stop(mut self) -> Result<(), CameraError> {
        self.halt()
    }

    pub fn halt(&mut self) -> Result<(), CameraError> {
        self.shutdown()
    }

    fn shutdown(&mut self) -> Result<(), CameraError> {
        self.stop.store(true, Ordering::Release);
        join_camera_worker(&mut self.worker, Duration::from_secs(2), "V4L2")
    }
}

fn join_worker(worker: JoinHandle<Result<(), CameraError>>) -> Result<(), CameraError> {
    join_camera_worker(&mut Some(worker), Duration::from_secs(2), "V4L2")
}

impl Drop for CameraCapture {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

pub fn list_cameras() -> Result<Vec<CameraDevice>, CameraError> {
    let mut devices = Vec::new();
    for node in v4l::context::enum_devices() {
        let path = node.path();
        let name = node.name().unwrap_or_else(|| path.display().to_string());
        if let Ok(device) = Device::with_path(path)
            && let Ok(caps) = device.query_caps()
            && !caps
                .capabilities
                .contains(v4l::capability::Flags::VIDEO_CAPTURE)
        {
            continue;
        }
        devices.push(CameraDevice {
            id: stable_path(path).display().to_string(),
            name,
        });
    }
    devices.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(devices)
}

fn stable_path(path: &Path) -> PathBuf {
    let Ok(entries) = std::fs::read_dir("/dev/v4l/by-id") else {
        return path.to_path_buf();
    };
    for entry in entries.flatten() {
        if std::fs::canonicalize(entry.path()).ok().as_deref() == Some(path) {
            return entry.path();
        }
    }
    path.to_path_buf()
}

fn camera_io_error(
    error: std::io::Error,
    fallback: impl FnOnce(String) -> CameraError,
) -> CameraError {
    if error.kind() == std::io::ErrorKind::PermissionDenied {
        CameraError::PermissionDenied(error.to_string())
    } else {
        fallback(error.to_string())
    }
}

pub fn open_camera(
    request: CameraRequest,
    clock: SessionClock,
    gate: Arc<StartGate>,
    limits: CameraQueueLimits,
) -> Result<CameraCapture, CameraError> {
    if request.width == 0 || request.height == 0 || request.fps == 0 {
        return Err(CameraError::UnsupportedFormat(
            "camera width, height and fps must be non-zero".into(),
        ));
    }
    if limits.frames == 0 || limits.bytes == 0 {
        return Err(CameraError::UnsupportedFormat(
            "camera queue limits must be non-zero".into(),
        ));
    }
    let path = Path::new(&request.device_id);
    let canonical = std::fs::canonicalize(path)
        .map_err(|error| camera_io_error(error, CameraError::DeviceUnavailable))?;
    if !canonical.to_string_lossy().starts_with("/dev/video") {
        return Err(CameraError::DeviceUnavailable(
            "camera ID does not resolve to a V4L2 video device".into(),
        ));
    }
    let device = Device::with_path(path)
        .map_err(|error| camera_io_error(error, CameraError::DeviceUnavailable))?;
    open_device(device, request, clock, gate, limits)
}

fn open_device<B: CameraBackend>(
    device: B,
    request: CameraRequest,
    clock: SessionClock,
    gate: Arc<StartGate>,
    limits: CameraQueueLimits,
) -> Result<CameraCapture, CameraError> {
    let (fourcc, pixel_format) = choose_format(&device)?;
    let negotiated = device
        .negotiate_format(&v4l::Format::new(request.width, request.height, fourcc))
        .map_err(|error| {
            camera_io_error(error, |detail| {
                CameraError::Backend(format!("V4L2 format negotiation: {detail}"))
            })
        })?;
    validate_fourcc(fourcc, negotiated.fourcc)?;
    let params = device
        .negotiate_params(&v4l::video::capture::Parameters::with_fps(request.fps))
        .map_err(|error| {
            camera_io_error(error, |detail| {
                CameraError::Backend(format!("V4L2 frame rate negotiation: {detail}"))
            })
        })?;
    let format = validated_format(pixel_format, negotiated, params)?;
    let (frame_tx, frames) = crossbeam_channel::bounded(limits.frames);
    let (events, event_tx, terminal_tx) = CameraEventQueue::new();
    let latest = Arc::new(LatestFrame::new());
    let queued_bytes = Arc::new(AtomicUsize::new(0));
    let stop = Arc::new(AtomicBool::new(false));
    let worker_latest = latest.clone();
    let worker_bytes = queued_bytes.clone();
    let worker_stop = stop.clone();
    let (ready_tx, ready_rx) = std::sync::mpsc::sync_channel(1);
    let worker = thread::Builder::new()
        .name("beam-v4l2-camera".into())
        .spawn(move || {
            let result = capture_worker(
                device,
                format,
                clock,
                gate,
                limits.bytes,
                frame_tx,
                event_tx,
                worker_latest,
                worker_bytes,
                worker_stop,
                ready_tx,
            );
            if let Err(error) = &result {
                let _ = terminal_tx.try_send(terminal_camera_event(error));
            }
            result
        })
        .map_err(|error| CameraError::Backend(error.to_string()))?;
    match ready_rx.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(())) => Ok(CameraCapture {
            frames,
            events,
            latest,
            queued_bytes,
            stop,
            worker: Some(worker),
            format,
        }),
        Ok(Err(error)) => {
            stop.store(true, Ordering::Release);
            let _ = join_worker(worker);
            Err(error)
        }
        Err(_) => {
            stop.store(true, Ordering::Release);
            let _ = join_worker(worker);
            Err(CameraError::Backend(
                "V4L2 stream initialization timed out".into(),
            ))
        }
    }
}

trait CameraBackend: Send + 'static {
    type Stream<'a>: FrameStream
    where
        Self: 'a;

    fn formats(&self) -> std::io::Result<Vec<FourCC>>;
    fn negotiate_format(&self, requested: &v4l::Format) -> std::io::Result<v4l::Format>;
    fn negotiate_params(
        &self,
        requested: &v4l::video::capture::Parameters,
    ) -> std::io::Result<v4l::video::capture::Parameters>;
    fn open_stream(&self) -> std::io::Result<Self::Stream<'_>>;
}

impl CameraBackend for Device {
    type Stream<'a> = MmapStream<'a>;

    fn formats(&self) -> std::io::Result<Vec<FourCC>> {
        Capture::enum_formats(self).map(|formats| formats.into_iter().map(|f| f.fourcc).collect())
    }

    fn negotiate_format(&self, requested: &v4l::Format) -> std::io::Result<v4l::Format> {
        Capture::set_format(self, requested)
    }

    fn negotiate_params(
        &self,
        requested: &v4l::video::capture::Parameters,
    ) -> std::io::Result<v4l::video::capture::Parameters> {
        Capture::set_params(self, requested)
    }

    fn open_stream(&self) -> std::io::Result<Self::Stream<'_>> {
        MmapStream::with_buffers(self, Type::VideoCapture, 4)
    }
}

fn choose_format<B: CameraBackend>(device: &B) -> Result<(FourCC, PixelFormat), CameraError> {
    let available = device
        .formats()
        .map_err(|error| camera_io_error(error, CameraError::Backend))?;
    choose_fourcc(&available)
}

fn choose_fourcc(available: &[FourCC]) -> Result<(FourCC, PixelFormat), CameraError> {
    for (code, pixel) in [
        (b"YUYV", PixelFormat::Yuyv),
        (b"NV12", PixelFormat::Nv12),
        (b"BGRA", PixelFormat::Bgra),
        (b"MJPG", PixelFormat::Mjpeg),
    ] {
        let fourcc = FourCC::new(code);
        if available.contains(&fourcc) {
            return Ok((fourcc, pixel));
        }
    }
    Err(CameraError::UnsupportedFormat(format!(
        "camera exposes no YUYV, NV12, BGRA or MJPEG stream: {:?}",
        available
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
    )))
}

fn validate_fourcc(requested: FourCC, selected: FourCC) -> Result<(), CameraError> {
    if selected != requested {
        return Err(CameraError::UnsupportedFormat(format!(
            "V4L2 selected unexpected format {}",
            selected
        )));
    }
    Ok(())
}

fn validated_format(
    pixel_format: PixelFormat,
    negotiated: v4l::Format,
    params: v4l::video::capture::Parameters,
) -> Result<CameraFormat, CameraError> {
    let fps = params
        .interval
        .denominator
        .checked_div(params.interval.numerator)
        .filter(|fps| *fps > 0)
        .ok_or_else(|| CameraError::UnsupportedFormat("V4L2 returned invalid fps".into()))?;
    Ok(CameraFormat {
        width: negotiated.width,
        height: negotiated.height,
        fps,
        pixel_format,
        stride: negotiated.stride,
    })
}

#[allow(clippy::too_many_arguments)]
fn capture_worker<B: CameraBackend>(
    device: B,
    format: CameraFormat,
    clock: SessionClock,
    gate: Arc<StartGate>,
    byte_limit: usize,
    frame_tx: Sender<CapturedFrame>,
    event_tx: Sender<CameraEvent>,
    latest: Arc<LatestFrame<CapturedFrame>>,
    queued_bytes: Arc<AtomicUsize>,
    stop: Arc<AtomicBool>,
    ready: std::sync::mpsc::SyncSender<Result<(), CameraError>>,
) -> Result<(), CameraError> {
    let stream = match device.open_stream() {
        Ok(stream) => stream,
        Err(error) => {
            let failure = camera_io_error(error, CameraError::Backend);
            let _ = ready.send(Err(failure.clone()));
            return Err(failure);
        }
    };
    run_camera_stream(
        stream,
        format,
        clock,
        gate,
        DispatchPorts {
            frame_tx,
            event_tx,
            latest,
            queued_bytes,
            byte_limit,
        },
        stop,
        ready,
    )
}

trait FrameStream {
    fn set_timeout(&mut self, timeout: Duration);
    fn next_frame(&mut self) -> std::io::Result<(&[u8], v4l::buffer::Metadata)>;
}

impl FrameStream for MmapStream<'_> {
    fn set_timeout(&mut self, timeout: Duration) {
        MmapStream::set_timeout(self, timeout);
    }

    fn next_frame(&mut self) -> std::io::Result<(&[u8], v4l::buffer::Metadata)> {
        self.next().map(|(bytes, metadata)| (bytes, *metadata))
    }
}

#[allow(clippy::too_many_arguments)]
fn run_camera_stream<S: FrameStream>(
    mut stream: S,
    format: CameraFormat,
    clock: SessionClock,
    gate: Arc<StartGate>,
    ports: DispatchPorts,
    stop: Arc<AtomicBool>,
    ready: std::sync::mpsc::SyncSender<Result<(), CameraError>>,
) -> Result<(), CameraError> {
    stream.set_timeout(Duration::from_millis(250));
    let _ = ready.send(Ok(()));
    let mut dispatcher = FrameDispatcher::new(format, clock, gate, ports);
    dispatcher.started();
    while !stop.load(Ordering::Acquire) {
        let (bytes, metadata) = match stream.next_frame() {
            Ok(frame) => frame,
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock
                ) =>
            {
                continue;
            }
            Err(error) => {
                return Err(camera_io_error(error, CameraError::DeviceUnavailable));
            }
        };
        dispatcher.dispatch(
            bytes,
            u64::from(metadata.sequence),
            metadata.bytesused,
            metadata.flags.contains(Flags::ERROR),
            native_timestamp_ns(&metadata),
        )?;
    }
    Ok(())
}

fn native_timestamp_ns(metadata: &v4l::buffer::Metadata) -> Option<u64> {
    if !metadata.flags.contains(Flags::TIMESTAMP_MONOTONIC) {
        return None;
    }
    let seconds = u64::try_from(metadata.timestamp.sec).ok()?;
    let micros = u64::try_from(metadata.timestamp.usec).ok()?;
    if micros >= 1_000_000 {
        return None;
    }
    seconds
        .checked_mul(1_000_000_000)?
        .checked_add(micros * 1_000)
}

#[path = "../../test/linux/capture_unit.rs"]
mod capture_checks;

#[path = "../../test/linux/stream.rs"]
mod stream_checks;

#[path = "../../test/linux/backend.rs"]
mod backend_checks;
