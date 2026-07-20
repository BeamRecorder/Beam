use std::{
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc,
    },
    thread::JoinHandle,
    time::Instant,
};

use crossbeam_channel::{TrySendError, bounded};
use nokhwa::{
    Camera,
    pixel_format::RgbAFormat,
    utils::{CameraFormat, CameraIndex, FrameFormat, RequestedFormat, RequestedFormatType},
};
use windows_capture::encoder::{
    AudioSettingsBuilder, ContainerSettingsBuilder, VideoEncoder, VideoSettingsBuilder,
    VideoSettingsSubType,
};

use crate::{CaptureError, model::CameraSelection, session::StartGate};

#[derive(Debug, Default)]
pub struct CameraCaptureMetrics {
    frames_acquired: AtomicU64,
    frames_encoded: AtomicU64,
    frames_dropped: AtomicU64,
    interruptions: AtomicU64,
}

impl CameraCaptureMetrics {
    #[must_use]
    pub fn frames_received(&self) -> u64 {
        self.frames_encoded()
    }
    #[must_use]
    pub fn frames_acquired(&self) -> u64 {
        self.frames_acquired.load(Ordering::Relaxed)
    }
    #[must_use]
    pub fn frames_encoded(&self) -> u64 {
        self.frames_encoded.load(Ordering::Relaxed)
    }
    #[must_use]
    pub fn frames_dropped(&self) -> u64 {
        self.frames_dropped.load(Ordering::Relaxed)
    }
    #[must_use]
    pub fn interruptions(&self) -> u64 {
        self.interruptions.load(Ordering::Relaxed)
    }
}

pub struct WindowsCameraRecording {
    cancel: Arc<AtomicBool>,
    thread: Option<JoinHandle<Result<u64, CaptureError>>>,
    metrics: Arc<CameraCaptureMetrics>,
    format: CameraFormat,
}

impl WindowsCameraRecording {
    pub fn start(
        selection: &CameraSelection,
        output: &Path,
        bitrate: u32,
        queue_capacity: usize,
        start_gate: Arc<StartGate>,
    ) -> Result<Self, CaptureError> {
        if bitrate == 0 || queue_capacity == 0 {
            return Err(CaptureError::InvalidConfiguration(
                "camera bitrate and queue capacity must be non-zero".into(),
            ));
        }
        let index = selection
            .source_id
            .as_str()
            .strip_prefix("nokhwa:")
            .ok_or_else(|| CaptureError::InvalidConfiguration("invalid Nokhwa source ID".into()))?
            .parse::<u32>()
            .map_err(|error| CaptureError::InvalidConfiguration(error.to_string()))?;
        let requested = CameraFormat::new_from(
            selection.preferred_width.unwrap_or(1280),
            selection.preferred_height.unwrap_or(720),
            FrameFormat::MJPEG,
            selection.preferred_fps.unwrap_or(30),
        );
        let selection = RequestedFormat::new::<RgbAFormat>(RequestedFormatType::Closest(requested));
        let output = output.to_owned();
        let cancel = Arc::new(AtomicBool::new(false));
        let thread_cancel = cancel.clone();
        let metrics = Arc::new(CameraCaptureMetrics::default());
        let thread_metrics = metrics.clone();
        let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
        let thread = std::thread::Builder::new()
            .name("capture-windows-camera".into())
            .spawn(move || {
                camera_loop(
                    index,
                    selection,
                    &output,
                    bitrate,
                    queue_capacity,
                    &start_gate,
                    &thread_cancel,
                    &thread_metrics,
                    &ready_sender,
                )
            })
            .map_err(backend_error)?;
        let format = ready_receiver
            .recv()
            .map_err(|_| CaptureError::Backend("camera startup channel closed".into()))??;
        Ok(Self {
            cancel,
            thread: Some(thread),
            metrics,
            format,
        })
    }

    pub fn stop(mut self) -> Result<u64, CaptureError> {
        self.finish()
    }
    #[must_use]
    pub fn metrics(&self) -> Arc<CameraCaptureMetrics> {
        self.metrics.clone()
    }
    #[must_use]
    pub const fn format(&self) -> CameraFormat {
        self.format
    }

    fn finish(&mut self) -> Result<u64, CaptureError> {
        self.cancel.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            return thread
                .join()
                .map_err(|_| CaptureError::Backend("camera thread panicked".into()))?;
        }
        Ok(self.metrics.frames_encoded())
    }
}

impl Drop for WindowsCameraRecording {
    fn drop(&mut self) {
        let _result = self.finish();
    }
}

fn camera_loop(
    index: u32,
    selection: RequestedFormat<'static>,
    output: &Path,
    bitrate: u32,
    queue_capacity: usize,
    start_gate: &Arc<StartGate>,
    cancel: &AtomicBool,
    metrics: &Arc<CameraCaptureMetrics>,
    ready: &mpsc::SyncSender<Result<CameraFormat, CaptureError>>,
) -> Result<u64, CaptureError> {
    let opened = open_camera(index, selection).and_then(|(mut camera, selected_format)| {
        camera.open_stream()?;
        Ok((camera, selected_format))
    });
    let (mut camera, format) = match opened {
        Ok(opened) => opened,
        Err(error) => {
            let _sent = ready.send(Err(backend_error(error)));
            return Err(CaptureError::Backend("camera failed to open".into()));
        }
    };
    let resolution = format.resolution();
    let (frame_sender, frame_receiver) = bounded::<EncodedFrame>(queue_capacity);
    let (encoder_ready_sender, encoder_ready_receiver) = mpsc::sync_channel(1);
    let encoder_output = output.to_owned();
    let writer_metrics = metrics.clone();
    let encoder = std::thread::Builder::new()
        .name("capture-windows-camera-encoder".into())
        .spawn(move || {
            let video = VideoSettingsBuilder::new(resolution.width(), resolution.height())
                .sub_type(VideoSettingsSubType::H264)
                .bitrate(bitrate)
                .frame_rate(format.frame_rate());
            let opened = VideoEncoder::new(
                video,
                AudioSettingsBuilder::default().disabled(true),
                ContainerSettingsBuilder::default(),
                &encoder_output,
            )
            .map_err(backend_error);
            let mut encoder = match opened {
                Ok(encoder) => {
                    let _sent = encoder_ready_sender.send(Ok(()));
                    encoder
                }
                Err(error) => {
                    let message = error.to_string();
                    let _sent = encoder_ready_sender.send(Err(message));
                    return Err(error);
                }
            };
            while let Ok(frame) = frame_receiver.recv() {
                encoder
                    .send_frame_buffer(&frame.buffer, frame.timestamp_100ns)
                    .map_err(|error| {
                        writer_metrics
                            .frames_dropped
                            .fetch_add(1, Ordering::Relaxed);
                        writer_metrics.interruptions.fetch_add(1, Ordering::Relaxed);
                        backend_error(error)
                    })?;
                writer_metrics
                    .frames_encoded
                    .fetch_add(1, Ordering::Relaxed);
            }
            encoder.finish().map_err(backend_error)
        })
        .map_err(backend_error)?;
    match encoder_ready_receiver.recv() {
        Ok(Ok(())) => {}
        Ok(Err(message)) => {
            let _joined = encoder.join();
            let error = CaptureError::Backend(message);
            let _sent = ready.send(Err(CaptureError::Backend(error.to_string())));
            return Err(error);
        }
        Err(_) => {
            let _joined = encoder.join();
            let error = CaptureError::Backend("camera encoder startup channel closed".into());
            let _sent = ready.send(Err(CaptureError::Backend(error.to_string())));
            return Err(error);
        }
    }
    ready
        .send(Ok(format))
        .map_err(|_| CaptureError::Backend("camera startup receiver closed".into()))?;
    if let Err(error) = start_gate.wait() {
        let _stopped = camera.stop_stream();
        drop(frame_sender);
        let _joined = encoder.join();
        return Err(error);
    }
    let mut rgba = vec![0; expected_buffer_len(resolution.width(), resolution.height())];
    let started = Instant::now();
    let mut capture_error = None;
    while !cancel.load(Ordering::Acquire) {
        if let Err(error) = camera.write_frame_to_buffer::<RgbAFormat>(&mut rgba) {
            metrics.interruptions.fetch_add(1, Ordering::Relaxed);
            capture_error = Some(backend_error(error));
            break;
        }
        metrics.frames_acquired.fetch_add(1, Ordering::Relaxed);
        rgba_to_bottom_up_bgra(&mut rgba, resolution.width(), resolution.height());
        let timestamp = i64::try_from(started.elapsed().as_nanos() / 100).unwrap_or(i64::MAX);
        match frame_sender.try_send(EncodedFrame {
            buffer: rgba,
            timestamp_100ns: timestamp,
        }) {
            Ok(()) => {
                rgba = vec![0; expected_buffer_len(resolution.width(), resolution.height())];
            }
            Err(TrySendError::Full(frame)) => {
                metrics.frames_dropped.fetch_add(1, Ordering::Relaxed);
                rgba = frame.buffer;
            }
            Err(TrySendError::Disconnected(_)) => {
                metrics.interruptions.fetch_add(1, Ordering::Relaxed);
                capture_error = Some(CaptureError::Backend(
                    "camera encoder stopped unexpectedly".into(),
                ));
                break;
            }
        }
    }
    let stop_result = camera.stop_stream().map_err(backend_error);
    drop(frame_sender);
    let encoder_result = encoder
        .join()
        .map_err(|_| CaptureError::Backend("camera encoder thread panicked".into()))?;
    if let Some(error) = capture_error {
        return Err(error);
    }
    stop_result?;
    encoder_result?;
    Ok(metrics.frames_encoded())
}

struct EncodedFrame {
    buffer: Vec<u8>,
    timestamp_100ns: i64,
}

fn open_camera(
    index: u32,
    selection: RequestedFormat<'static>,
) -> Result<(Camera, CameraFormat), nokhwa::NokhwaError> {
    let desired = match selection.requested_format_type() {
        RequestedFormatType::Closest(format) | RequestedFormatType::Exact(format) => format,
        _ => CameraFormat::new_from(1280, 720, FrameFormat::MJPEG, 30),
    };
    if let Ok(mut camera) = Camera::new(
        CameraIndex::Index(index),
        RequestedFormat::new::<RgbAFormat>(RequestedFormatType::None),
    ) && let Ok(formats) = camera.compatible_camera_formats()
        && let Some(format) = formats.into_iter().min_by_key(|format| {
            u64::from(format.width().abs_diff(desired.width()))
                + u64::from(format.height().abs_diff(desired.height()))
                + u64::from(format.frame_rate().abs_diff(desired.frame_rate())) * 10_000
                + u64::from(format.format() != desired.format()) * 1_000_000
        })
        && camera
            .set_camera_requset(RequestedFormat::new::<RgbAFormat>(
                RequestedFormatType::Exact(format),
            ))
            .is_ok()
    {
        return Ok((camera, format));
    }
    let formats = [
        desired.format(),
        FrameFormat::MJPEG,
        FrameFormat::NV12,
        FrameFormat::YUYV,
        FrameFormat::RAWRGB,
        FrameFormat::RAWBGR,
    ];
    let mut last_error = None;
    for format in formats {
        let candidate = CameraFormat::new(desired.resolution(), format, desired.frame_rate());
        for request_type in [
            RequestedFormatType::Exact(candidate),
            RequestedFormatType::Closest(candidate),
        ] {
            let requested = RequestedFormat::new::<RgbAFormat>(request_type);
            match Camera::new(CameraIndex::Index(index), requested) {
                Ok(camera) => {
                    let negotiated = camera.camera_format();
                    return Ok((camera, negotiated));
                }
                Err(error) => last_error = Some(error),
            }
        }
    }
    Camera::new(
        CameraIndex::Index(index),
        RequestedFormat::new::<RgbAFormat>(RequestedFormatType::None),
    )
    .map(|camera| {
        let negotiated = camera.camera_format();
        (camera, negotiated)
    })
    .map_err(|error| last_error.unwrap_or(error))
}

fn expected_buffer_len(width: u32, height: u32) -> usize {
    usize::try_from(width)
        .unwrap_or(usize::MAX)
        .saturating_mul(usize::try_from(height).unwrap_or(usize::MAX))
        .saturating_mul(4)
}

fn rgba_to_bottom_up_bgra(buffer: &mut [u8], width: u32, height: u32) {
    for pixel in buffer.chunks_exact_mut(4) {
        pixel.swap(0, 2);
    }
    flip_rows(buffer, width, height);
}

fn flip_rows(buffer: &mut [u8], width: u32, height: u32) {
    let stride = usize::try_from(width)
        .unwrap_or(usize::MAX)
        .saturating_mul(4);
    let rows = usize::try_from(height).unwrap_or(usize::MAX);
    for row in 0..rows / 2 {
        let opposite = rows - row - 1;
        let (before, after) = buffer.split_at_mut(opposite * stride);
        before[row * stride..(row + 1) * stride].swap_with_slice(&mut after[..stride]);
    }
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("camera capture failed: {error}"))
}
