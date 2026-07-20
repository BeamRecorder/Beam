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

use nokhwa::{
    Camera,
    pixel_format::RgbAFormat,
    utils::{CameraFormat, CameraIndex, FrameFormat, RequestedFormat, RequestedFormatType},
};
use windows_capture::encoder::{
    AudioSettingsBuilder, ContainerSettingsBuilder, VideoEncoder, VideoSettingsBuilder,
    VideoSettingsSubType,
};

use crate::{CaptureError, model::CameraSelection};

#[derive(Debug, Default)]
pub struct CameraCaptureMetrics {
    frames_received: AtomicU64,
    frames_dropped: AtomicU64,
    interruptions: AtomicU64,
}

impl CameraCaptureMetrics {
    #[must_use]
    pub fn frames_received(&self) -> u64 {
        self.frames_received.load(Ordering::Relaxed)
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
    ) -> Result<Self, CaptureError> {
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
        Ok(self.metrics.frames_received())
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
    cancel: &AtomicBool,
    metrics: &CameraCaptureMetrics,
    ready: &mpsc::SyncSender<Result<CameraFormat, CaptureError>>,
) -> Result<u64, CaptureError> {
    let opened = open_camera(index, selection).and_then(|mut camera| {
        camera.open_stream()?;
        Ok(camera)
    });
    let mut camera = match opened {
        Ok(camera) => camera,
        Err(error) => {
            let _sent = ready.send(Err(backend_error(error)));
            return Err(CaptureError::Backend("camera failed to open".into()));
        }
    };
    let format = camera.camera_format();
    ready
        .send(Ok(format))
        .map_err(|_| CaptureError::Backend("camera startup receiver closed".into()))?;
    let resolution = format.resolution();
    let video = VideoSettingsBuilder::new(resolution.width(), resolution.height())
        .sub_type(VideoSettingsSubType::H264)
        .bitrate(bitrate)
        .frame_rate(format.frame_rate());
    let mut encoder = VideoEncoder::new(
        video,
        AudioSettingsBuilder::default().disabled(true),
        ContainerSettingsBuilder::default(),
        output,
    )
    .map_err(backend_error)?;
    let mut rgba = vec![
        0;
        usize::try_from(resolution.width())
            .unwrap_or(usize::MAX)
            .saturating_mul(usize::try_from(resolution.height()).unwrap_or(usize::MAX))
            .saturating_mul(4)
    ];
    let started = Instant::now();
    while !cancel.load(Ordering::Acquire) {
        if let Err(error) = camera.write_frame_to_buffer::<RgbAFormat>(&mut rgba) {
            metrics.interruptions.fetch_add(1, Ordering::Relaxed);
            return Err(backend_error(error));
        }
        rgba_to_bottom_up_bgra(&mut rgba, resolution.width(), resolution.height());
        let timestamp = i64::try_from(started.elapsed().as_nanos() / 100).unwrap_or(i64::MAX);
        match encoder.send_frame_buffer(&rgba, timestamp) {
            Ok(()) => {
                metrics.frames_received.fetch_add(1, Ordering::Relaxed);
            }
            Err(error) => {
                metrics.frames_dropped.fetch_add(1, Ordering::Relaxed);
                return Err(backend_error(error));
            }
        }
        bottom_up_bgra_to_rgba(&mut rgba, resolution.width(), resolution.height());
    }
    camera.stop_stream().map_err(backend_error)?;
    encoder.finish().map_err(backend_error)?;
    Ok(metrics.frames_received())
}

fn open_camera(
    index: u32,
    selection: RequestedFormat<'static>,
) -> Result<Camera, nokhwa::NokhwaError> {
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
        return Ok(camera);
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
                Ok(camera) => return Ok(camera),
                Err(error) => last_error = Some(error),
            }
        }
    }
    Camera::new(
        CameraIndex::Index(index),
        RequestedFormat::new::<RgbAFormat>(RequestedFormatType::None),
    )
    .map_err(|error| last_error.unwrap_or(error))
}

fn rgba_to_bottom_up_bgra(buffer: &mut [u8], width: u32, height: u32) {
    for pixel in buffer.chunks_exact_mut(4) {
        pixel.swap(0, 2);
    }
    flip_rows(buffer, width, height);
}

fn bottom_up_bgra_to_rgba(buffer: &mut [u8], width: u32, height: u32) {
    flip_rows(buffer, width, height);
    for pixel in buffer.chunks_exact_mut(4) {
        pixel.swap(0, 2);
    }
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
