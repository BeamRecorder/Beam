use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use beam_media_core::{
    LatestFrame, MonotonicClock, NativeTimestampMapper, SessionClock, StartGate, VideoFrame,
};
use crossbeam_channel::{Receiver, Sender, TryRecvError, TrySendError};
use dispatch2::DispatchQueue;
use objc2::{
    rc::Retained,
    runtime::{AnyObject, ProtocolObject},
};
use objc2_av_foundation::{
    AVCaptureDeviceInput, AVCaptureSession, AVCaptureSessionPresetInputPriority,
    AVCaptureVideoDataOutput,
};
use objc2_core_video::kCVPixelFormatType_32BGRA;
use objc2_foundation::{NSDictionary, NSNumber, NSString};

use crate::{
    CameraError, CameraEvent, CameraFormat, CameraFrame, CameraQueueLimits, CameraRequest,
    events::{CameraEventQueue, terminal_camera_event},
    worker::{camera_read_timed_out, join_camera_worker},
};

use super::{
    catalog::{ensure_permission, open_device},
    delegate::{CallbackState, CameraDelegate},
    format::choose_format,
    types::OwnedSample,
};

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
                "AVFoundation camera capture stopped".into(),
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
        self.stop.store(true, Ordering::Release);
        join_camera_worker(&mut self.worker, Duration::from_secs(3), "AVFoundation")
    }
}

impl Drop for CameraCapture {
    fn drop(&mut self) {
        let _ = self.halt();
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
    ensure_permission()?;
    let (frame_tx, frames) = crossbeam_channel::bounded(limits.frames);
    let (events, event_tx, terminal_tx) = CameraEventQueue::new();
    let latest = Arc::new(LatestFrame::new());
    let queued_bytes = Arc::new(AtomicUsize::new(0));
    let stop = Arc::new(AtomicBool::new(false));
    let (ready_tx, ready_rx) = mpsc::sync_channel(1);
    let worker = thread::Builder::new()
        .name("beam-avfoundation-camera".into())
        .spawn({
            let latest = latest.clone();
            let queued_bytes = queued_bytes.clone();
            let stop = stop.clone();
            move || {
                capture_worker(
                    request,
                    clock,
                    gate,
                    limits.bytes,
                    frame_tx,
                    event_tx,
                    terminal_tx,
                    latest,
                    queued_bytes,
                    stop,
                    ready_tx,
                )
            }
        })
        .map_err(|error| CameraError::Backend(format!("starting camera worker: {error}")))?;
    match ready_rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(format)) => Ok(CameraCapture {
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
            let _ = worker.join();
            Err(error)
        }
        Err(_) => {
            stop.store(true, Ordering::Release);
            Err(CameraError::Backend(
                "AVFoundation camera initialization timed out".into(),
            ))
        }
    }
}

struct OpenedCamera {
    session: Retained<AVCaptureSession>,
    output: Retained<AVCaptureVideoDataOutput>,
    _delegate: Retained<CameraDelegate>,
    _queue: dispatch2::DispatchRetained<DispatchQueue>,
}

impl Drop for OpenedCamera {
    fn drop(&mut self) {
        unsafe {
            self.session.stopRunning();
            self.output.setSampleBufferDelegate_queue(None, None);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn capture_worker(
    request: CameraRequest,
    clock: SessionClock,
    gate: Arc<StartGate>,
    byte_limit: usize,
    frame_tx: Sender<CapturedFrame>,
    event_tx: Sender<CameraEvent>,
    terminal_tx: Sender<CameraEvent>,
    latest: Arc<LatestFrame<CapturedFrame>>,
    queued_bytes: Arc<AtomicUsize>,
    stop: Arc<AtomicBool>,
    ready: mpsc::SyncSender<Result<CameraFormat, CameraError>>,
) -> Result<(), CameraError> {
    let (sample_tx, sample_rx) = crossbeam_channel::bounded(2);
    let state = Arc::new(CallbackState::default());
    let opened = open_session(
        &request,
        byte_limit,
        sample_tx,
        event_tx.clone(),
        state.clone(),
    );
    let (camera, format) = match opened {
        Ok(value) => value,
        Err(error) => {
            let _ = ready.send(Err(error));
            return Ok(());
        }
    };
    if ready.send(Ok(format)).is_err() {
        return Ok(());
    }
    let result = run_capture(
        &camera,
        clock,
        gate,
        byte_limit,
        frame_tx,
        event_tx.clone(),
        latest,
        queued_bytes,
        stop,
        &sample_rx,
        &state,
    );
    if let Err(error) = &result {
        let _ = terminal_tx.try_send(terminal_camera_event(error));
    }
    drop(camera);
    result
}

fn open_session(
    request: &CameraRequest,
    byte_limit: usize,
    samples: Sender<OwnedSample>,
    events: Sender<CameraEvent>,
    state: Arc<CallbackState>,
) -> Result<(OpenedCamera, CameraFormat), CameraError> {
    let device = open_device(&request.device_id)?;
    let session = unsafe { AVCaptureSession::new() };
    let preset = unsafe { AVCaptureSessionPresetInputPriority };
    if !unsafe { session.canSetSessionPreset(preset) } {
        return Err(CameraError::UnsupportedFormat(
            "AVFoundation input-priority session preset is unavailable".into(),
        ));
    }
    unsafe { session.setSessionPreset(preset) };
    let format = choose_format(&device, request)?;
    let input = unsafe { AVCaptureDeviceInput::deviceInputWithDevice_error(&device) }
        .map_err(|error| CameraError::DeviceUnavailable(format!("opening camera: {error}")))?;
    let output = unsafe { AVCaptureVideoDataOutput::new() };
    if !unsafe { session.canAddInput(&input) } {
        return Err(CameraError::UnsupportedFormat(
            "AVFoundation cannot connect camera input".into(),
        ));
    }
    unsafe { session.addInput(&input) };
    if !unsafe { session.canAddOutput(&output) } {
        return Err(CameraError::UnsupportedFormat(
            "AVFoundation cannot connect camera output".into(),
        ));
    }
    unsafe { session.addOutput(&output) };
    let supported = unsafe { output.availableVideoCVPixelFormatTypes() }
        .iter()
        .any(|pixel_format| pixel_format.unsignedIntValue() == kCVPixelFormatType_32BGRA);
    if !supported {
        return Err(CameraError::UnsupportedFormat(
            "AVFoundation camera cannot output BGRA frames".into(),
        ));
    }
    let key = NSString::from_str("PixelFormatType");
    let number = NSNumber::new_u32(kCVPixelFormatType_32BGRA);
    let value: &AnyObject = &number;
    let settings = NSDictionary::<NSString, AnyObject>::from_slices(&[&*key], &[value]);
    unsafe {
        output.setVideoSettings(Some(&settings));
        output.setAlwaysDiscardsLateVideoFrames(true);
    }
    let delegate = CameraDelegate::new(samples, events, state, format, byte_limit);
    let queue = DispatchQueue::new("beam.avfoundation.camera", None);
    unsafe {
        output.setSampleBufferDelegate_queue(
            Some(ProtocolObject::from_ref(&*delegate)),
            Some(&queue),
        );
        session.startRunning();
    }
    if !unsafe { session.isRunning() } {
        unsafe { output.setSampleBufferDelegate_queue(None, None) };
        return Err(CameraError::DeviceUnavailable(
            "AVFoundation camera did not start".into(),
        ));
    }
    Ok((
        OpenedCamera {
            session,
            output,
            _delegate: delegate,
            _queue: queue,
        },
        format,
    ))
}

#[allow(clippy::too_many_arguments)]
fn run_capture(
    camera: &OpenedCamera,
    clock: SessionClock,
    gate: Arc<StartGate>,
    byte_limit: usize,
    frame_tx: Sender<CapturedFrame>,
    event_tx: Sender<CameraEvent>,
    latest: Arc<LatestFrame<CapturedFrame>>,
    queued_bytes: Arc<AtomicUsize>,
    stop: Arc<AtomicBool>,
    samples: &Receiver<OwnedSample>,
    state: &CallbackState,
) -> Result<(), CameraError> {
    let mut mapper: Option<NativeTimestampMapper> = None;
    let mut gate_epoch = 0;
    let mut last_pts = 0_u64;
    let mut last_sample_at = Instant::now();
    let _ = event_tx.try_send(CameraEvent::Started);
    while !stop.load(Ordering::Acquire) {
        if let Some(reason) = state.failure() {
            return Err(CameraError::Backend(reason));
        }
        let sample = match samples.recv_timeout(Duration::from_millis(50)) {
            Ok(sample) => {
                last_sample_at = Instant::now();
                sample
            }
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => {
                if !unsafe { camera.session.isRunning() } {
                    return Err(CameraError::DeviceUnavailable(
                        "AVFoundation camera stopped unexpectedly".into(),
                    ));
                }
                if camera_read_timed_out(last_sample_at, Instant::now()) {
                    return Err(CameraError::DeviceUnavailable(
                        "AVFoundation camera delivered no frame for ten seconds".into(),
                    ));
                }
                continue;
            }
            Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                return Err(CameraError::Backend(
                    "AVFoundation camera callback stopped".into(),
                ));
            }
        };
        let Some(session_now) = gate.session_ns(clock.now_ns()) else {
            latest.publish(VideoFrame {
                captured_ns: gate.elapsed_ns(clock.now_ns()).unwrap_or(0),
                width: sample.format.width,
                height: sample.format.height,
                data: CameraFrame {
                    format: sample.format,
                    native_timestamp_ns: sample.native_timestamp_ns,
                    sequence: sample.sequence,
                    data: Arc::from(sample.bytes),
                },
            });
            continue;
        };
        if gate.epoch() != gate_epoch {
            mapper = None;
            gate_epoch = gate.epoch();
        }
        let mapped = if let Some(native_ns) = sample.native_timestamp_ns {
            if mapper.is_none() {
                mapper = Some(
                    NativeTimestampMapper::new(native_ns, session_now, 1_000_000_000)
                        .map_err(|error| CameraError::Clock(error.to_string()))?,
                );
            }
            let Some(active) = mapper.as_mut() else {
                continue;
            };
            match active.map(native_ns) {
                Ok(pts) => pts,
                Err(_) => {
                    let _ = event_tx.try_send(CameraEvent::ClockDiscontinuity {
                        sequence: sample.sequence,
                    });
                    *active = NativeTimestampMapper::new(native_ns, session_now, 1_000_000_000)
                        .map_err(|error| CameraError::Clock(error.to_string()))?;
                    session_now
                }
            }
        } else {
            session_now
        };
        let captured_ns = mapped.max(last_pts.saturating_add(1));
        last_pts = captured_ns;
        let frame = VideoFrame {
            captured_ns,
            width: sample.format.width,
            height: sample.format.height,
            data: CameraFrame {
                format: sample.format,
                native_timestamp_ns: sample.native_timestamp_ns,
                sequence: sample.sequence,
                data: Arc::from(sample.bytes),
            },
        };
        latest.publish(frame.clone());
        let size = frame.data.data.len();
        if queued_bytes
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |current| {
                current.checked_add(size).filter(|next| *next <= byte_limit)
            })
            .is_err()
        {
            let _ = event_tx.try_send(CameraEvent::Dropped {
                sequence: frame.data.sequence,
            });
            continue;
        }
        match frame_tx.try_send(frame) {
            Ok(()) => {}
            Err(TrySendError::Full(frame)) => {
                queued_bytes.fetch_sub(size, Ordering::AcqRel);
                let _ = event_tx.try_send(CameraEvent::Dropped {
                    sequence: frame.data.sequence,
                });
            }
            Err(TrySendError::Disconnected(_)) => {
                queued_bytes.fetch_sub(size, Ordering::AcqRel);
                return Err(CameraError::Backend("camera consumer disconnected".into()));
            }
        }
    }
    Ok(())
}

#[path = "../../test/macos/capture.rs"]
mod capture_checks;
