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
use windows::Win32::Media::MediaFoundation::{
    IMFMediaSource, IMFSourceReader, IMFSourceReaderCallback, MF_READWRITE_DISABLE_CONVERTERS,
    MF_SOURCE_READER_ASYNC_CALLBACK, MF_SOURCE_READER_FIRST_VIDEO_STREAM,
    MF_SOURCE_READERF_CURRENTMEDIATYPECHANGED, MF_SOURCE_READERF_ENDOFSTREAM,
    MF_SOURCE_READERF_ERROR, MF_SOURCE_READERF_NATIVEMEDIATYPECHANGED, MFCreateAttributes,
    MFCreateSourceReaderFromMediaSource,
};

use crate::{
    CameraError, CameraEvent, CameraFormat, CameraFrame, CameraQueueLimits, CameraRequest,
    events::{CameraEventQueue, terminal_camera_event},
    worker::{camera_read_timed_out, join_camera_worker},
};

use super::{
    callback::{ReaderCallback, ReaderEvent, ReaderState},
    camera_windows_error,
    catalog::{MfRuntime, activate_camera},
    format::choose_format,
    sample::{copy_sample, format_with_buffer_stride},
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
                "Media Foundation camera capture stopped".into(),
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
        join_camera_worker(&mut self.worker, Duration::from_secs(3), "Media Foundation")
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
    let (frame_tx, frames) = crossbeam_channel::bounded(limits.frames);
    let (events, event_tx, terminal_tx) = CameraEventQueue::new();
    let latest = Arc::new(LatestFrame::new());
    let queued_bytes = Arc::new(AtomicUsize::new(0));
    let stop = Arc::new(AtomicBool::new(false));
    let (ready_tx, ready_rx) = mpsc::sync_channel(1);
    let worker = thread::Builder::new()
        .name("beam-media-foundation-camera".into())
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
                "Media Foundation camera initialization timed out".into(),
            ))
        }
    }
}

struct OpenedCamera {
    reader: Option<IMFSourceReader>,
    source: Option<IMFMediaSource>,
    _runtime: MfRuntime,
}

impl OpenedCamera {
    fn reader(&self) -> Result<&IMFSourceReader, CameraError> {
        self.reader
            .as_ref()
            .ok_or_else(|| CameraError::Backend("camera reader already closed".into()))
    }

    fn close(&mut self) -> Result<(), CameraError> {
        self.reader.take();
        if let Some(source) = self.source.take() {
            unsafe { source.Shutdown() }.map_err(|error| {
                CameraError::Backend(format!("shutting down camera source: {error}"))
            })?;
        }
        Ok(())
    }
}

impl Drop for OpenedCamera {
    fn drop(&mut self) {
        let _ = self.close();
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
    let (sample_tx, sample_rx) = crossbeam_channel::bounded(4);
    let callback_state = Arc::new(ReaderState::default());
    let opened = open_reader(&request, sample_tx, callback_state.clone());
    let (mut camera, format) = match opened {
        Ok(value) => value,
        Err(error) => {
            let _ = ready.send(Err(error));
            return Ok(());
        }
    };
    if ready.send(Ok(format)).is_err() {
        return Ok(());
    }
    let result = run_reader(
        camera.reader()?,
        format,
        clock,
        gate,
        byte_limit,
        frame_tx,
        event_tx,
        latest,
        queued_bytes,
        stop.clone(),
        &sample_rx,
        &callback_state,
    );
    let cancel = cancel_reader(camera.reader()?, &sample_rx, &callback_state);
    let close = camera.close();
    let result = result.and(cancel).and(close);
    if let Err(error) = &result {
        let _ = terminal_tx.try_send(terminal_camera_event(error));
    }
    result
}

fn open_reader(
    request: &CameraRequest,
    sample_tx: Sender<ReaderEvent>,
    callback_state: Arc<ReaderState>,
) -> Result<(OpenedCamera, CameraFormat), CameraError> {
    let runtime = MfRuntime::start()?;
    let activation = activate_camera(&request.device_id)?;
    let source: IMFMediaSource = unsafe { activation.ActivateObject() }.map_err(|error| {
        camera_windows_error(error, "activating camera", CameraError::DeviceUnavailable)
    })?;
    let mut camera = OpenedCamera {
        reader: None,
        source: Some(source),
        _runtime: runtime,
    };
    let mut attributes = None;
    unsafe { MFCreateAttributes(&mut attributes, 2) }
        .map_err(|error| CameraError::Backend(format!("reader attributes: {error}")))?;
    let attributes = attributes
        .ok_or_else(|| CameraError::Backend("missing source reader attributes".into()))?;
    let callback: IMFSourceReaderCallback = ReaderCallback::new(sample_tx, callback_state).into();
    unsafe { attributes.SetUnknown(&MF_SOURCE_READER_ASYNC_CALLBACK, &callback) }
        .map_err(|error| CameraError::Backend(format!("source reader callback: {error}")))?;
    unsafe { attributes.SetUINT32(&MF_READWRITE_DISABLE_CONVERTERS, 1) }
        .map_err(|error| CameraError::Backend(format!("disabling camera converters: {error}")))?;
    let source = camera
        .source
        .as_ref()
        .ok_or_else(|| CameraError::Backend("camera source already closed".into()))?;
    let reader =
        unsafe { MFCreateSourceReaderFromMediaSource(source, &attributes) }.map_err(|error| {
            camera_windows_error(error, "opening source reader", CameraError::Backend)
        })?;
    unsafe { reader.SetStreamSelection(MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32, true) }
        .map_err(|error| CameraError::Backend(format!("selecting camera stream: {error}")))?;
    let format = choose_format(&reader, request)?;
    camera.reader = Some(reader);
    Ok((camera, format))
}

#[allow(clippy::too_many_arguments)]
fn run_reader(
    reader: &IMFSourceReader,
    format: CameraFormat,
    clock: SessionClock,
    gate: Arc<StartGate>,
    byte_limit: usize,
    frame_tx: Sender<CapturedFrame>,
    event_tx: Sender<CameraEvent>,
    latest: Arc<LatestFrame<CapturedFrame>>,
    queued_bytes: Arc<AtomicUsize>,
    stop: Arc<AtomicBool>,
    samples: &Receiver<ReaderEvent>,
    callback_state: &ReaderState,
) -> Result<(), CameraError> {
    let mut mapper: Option<NativeTimestampMapper> = None;
    let mut gate_epoch = 0;
    let mut sequence = 0_u64;
    let mut last_pts = 0_u64;
    let mut last_frame_at = Instant::now();
    let _ = event_tx.try_send(CameraEvent::Started);
    while !stop.load(Ordering::Acquire) {
        unsafe {
            reader.ReadSample(
                MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32,
                0,
                None,
                None,
                None,
                None,
            )
        }
        .map_err(|error| CameraError::Backend(format!("requesting camera frame: {error}")))?;
        let pending_since = Instant::now();
        let sample = loop {
            if stop.load(Ordering::Acquire) {
                return Ok(());
            }
            if let Some(reason) = callback_state.failure() {
                return Err(CameraError::Backend(reason));
            }
            match samples.recv_timeout(Duration::from_millis(50)) {
                Ok(ReaderEvent::Sample {
                    status,
                    flags,
                    timestamp_100ns,
                    sample,
                }) => {
                    break (status, flags, timestamp_100ns, sample);
                }
                Err(crossbeam_channel::RecvTimeoutError::Timeout) => {
                    if camera_read_timed_out(pending_since, Instant::now()) {
                        let reason =
                            "Media Foundation camera delivered no callback for ten seconds";
                        return Err(CameraError::DeviceUnavailable(reason.into()));
                    }
                }
                Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                    return Err(CameraError::Backend(
                        "Media Foundation callback stopped".into(),
                    ));
                }
            }
        };
        let (status, flags, timestamp_100ns, sample) = sample;
        if status.is_err() || flags & MF_SOURCE_READERF_ERROR.0 as u32 != 0 {
            let reason = format!("Media Foundation camera read failed: {status}");
            return Err(CameraError::DeviceUnavailable(reason));
        }
        if flags & MF_SOURCE_READERF_ENDOFSTREAM.0 as u32 != 0 {
            return Err(CameraError::DeviceUnavailable("camera stream ended".into()));
        }
        if flags
            & (MF_SOURCE_READERF_CURRENTMEDIATYPECHANGED.0 as u32
                | MF_SOURCE_READERF_NATIVEMEDIATYPECHANGED.0 as u32)
            != 0
        {
            return Err(CameraError::UnsupportedFormat(
                "camera format changed during capture".into(),
            ));
        }
        let Some(sample) = sample else {
            if camera_read_timed_out(last_frame_at, Instant::now()) {
                let reason = "Media Foundation camera delivered no frame for ten seconds";
                return Err(CameraError::DeviceUnavailable(reason.into()));
            }
            continue;
        };
        last_frame_at = Instant::now();
        let Some(session_now) = gate.session_ns(clock.now_ns()) else {
            let data = copy_sample(&sample, byte_limit)?;
            latest.publish(VideoFrame {
                captured_ns: gate.elapsed_ns(clock.now_ns()).unwrap_or(0),
                width: format.width,
                height: format.height,
                data: CameraFrame {
                    format: format_with_buffer_stride(format, data.len()),
                    native_timestamp_ns: None,
                    sequence,
                    data,
                },
            });
            continue;
        };
        sequence = sequence.saturating_add(1);
        let native_ns = u64::try_from(timestamp_100ns)
            .ok()
            .and_then(|value| value.checked_mul(100));
        if gate.epoch() != gate_epoch {
            mapper = None;
            gate_epoch = gate.epoch();
        }
        let mapped = if let Some(native_ns) = native_ns {
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
                    let _ = event_tx.try_send(CameraEvent::ClockDiscontinuity { sequence });
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
        let data = copy_sample(&sample, byte_limit)?;
        let frame_format = format_with_buffer_stride(format, data.len());
        let frame = VideoFrame {
            captured_ns,
            width: format.width,
            height: format.height,
            data: CameraFrame {
                format: frame_format,
                native_timestamp_ns: native_ns,
                sequence,
                data,
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
            let _ = event_tx.try_send(CameraEvent::Dropped { sequence });
            continue;
        }
        match frame_tx.try_send(frame) {
            Ok(()) => {}
            Err(TrySendError::Full(_)) => {
                queued_bytes.fetch_sub(size, Ordering::AcqRel);
                let _ = event_tx.try_send(CameraEvent::Dropped { sequence });
            }
            Err(TrySendError::Disconnected(_)) => {
                queued_bytes.fetch_sub(size, Ordering::AcqRel);
                return Err(CameraError::Backend("camera consumer disconnected".into()));
            }
        }
    }
    Ok(())
}

fn cancel_reader(
    reader: &IMFSourceReader,
    samples: &Receiver<ReaderEvent>,
    callback_state: &ReaderState,
) -> Result<(), CameraError> {
    unsafe { reader.Flush(MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32) }
        .map_err(|error| CameraError::Backend(format!("canceling camera read: {error}")))?;
    let deadline = Instant::now() + Duration::from_secs(2);
    while !callback_state.flushed.load(Ordering::Acquire) && Instant::now() < deadline {
        let _ = samples.recv_timeout(Duration::from_millis(20));
    }
    if callback_state.flushed.load(Ordering::Acquire) {
        Ok(())
    } else {
        Err(CameraError::Backend(
            "Media Foundation camera flush timed out".into(),
        ))
    }
}

#[path = "../../test/windows/capture.rs"]
mod capture_checks;
