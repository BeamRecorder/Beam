use std::{
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc,
    },
    thread::JoinHandle,
};

use crossbeam_channel::TrySendError;
use nokhwa::{
    Camera,
    pixel_format::RgbAFormat,
    utils::{CameraFormat, CameraIndex, FrameFormat, RequestedFormat, RequestedFormatType},
};

use crate::{CaptureError, model::CameraSelection, session::StartGate};

use super::writer::{VideoFrame, spawn_writer};

#[derive(Debug, Default)]
pub struct MacCameraMetrics {
    frames_acquired: AtomicU64,
    frames_encoded: AtomicU64,
    frames_dropped: AtomicU64,
    interruptions: AtomicU64,
}

impl MacCameraMetrics {
    pub(super) fn encoded_one(&self) {
        self.frames_encoded.fetch_add(1, Ordering::Relaxed);
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
    pub fn frames_received(&self) -> u64 {
        self.frames_encoded()
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

pub struct MacCameraRecording {
    cancel: Arc<AtomicBool>,
    thread: Option<JoinHandle<Result<u64, CaptureError>>>,
    metrics: Arc<MacCameraMetrics>,
    format: CameraFormat,
}

impl MacCameraRecording {
    pub fn start(
        selection: &CameraSelection,
        output: &Path,
        start_gate: Arc<StartGate>,
        queue_capacity: usize,
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
        let cancel = Arc::new(AtomicBool::new(false));
        let thread_cancel = cancel.clone();
        let metrics = Arc::new(MacCameraMetrics::default());
        let thread_metrics = metrics.clone();
        let output = output.to_owned();
        let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
        let thread = std::thread::Builder::new()
            .name("capture-macos-camera".into())
            .spawn(move || {
                camera_loop(
                    index,
                    requested,
                    &output,
                    &thread_cancel,
                    &thread_metrics,
                    &ready_sender,
                    &start_gate,
                    queue_capacity,
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
    pub fn metrics(&self) -> Arc<MacCameraMetrics> {
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
                .map_err(|_| CaptureError::Backend("macOS camera thread panicked".into()))?;
        }
        Ok(self.metrics.frames_encoded())
    }
}

impl Drop for MacCameraRecording {
    fn drop(&mut self) {
        let _result = self.finish();
    }
}

fn camera_loop(
    index: u32,
    desired: CameraFormat,
    output: &Path,
    cancel: &AtomicBool,
    metrics: &Arc<MacCameraMetrics>,
    ready: &mpsc::SyncSender<Result<CameraFormat, CaptureError>>,
    start_gate: &Arc<StartGate>,
    queue_capacity: usize,
) -> Result<u64, CaptureError> {
    let requested = RequestedFormat::new::<RgbAFormat>(RequestedFormatType::Closest(desired));
    let opened = Camera::new(CameraIndex::Index(index), requested)
        .or_else(|_| {
            Camera::new(
                CameraIndex::Index(index),
                RequestedFormat::new::<RgbAFormat>(RequestedFormatType::None),
            )
        })
        .and_then(|mut camera| {
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
    let width = format.width();
    let height = format.height();
    let expected = usize::try_from(width)
        .map_err(backend_error)?
        .saturating_mul(usize::try_from(height).map_err(backend_error)?)
        .saturating_mul(4);
    let mut rgba = vec![0; expected];
    let (frame_sender, writer) = spawn_writer(
        output,
        width,
        height,
        queue_capacity.max(1),
        metrics.clone(),
    )?;
    ready
        .send(Ok(format))
        .map_err(|_| CaptureError::Backend("camera startup receiver closed".into()))?;
    start_gate.wait()?;
    let started = std::time::Instant::now();
    while !cancel.load(Ordering::Acquire) {
        if let Err(error) = camera.write_frame_to_buffer::<RgbAFormat>(&mut rgba) {
            metrics.interruptions.fetch_add(1, Ordering::Relaxed);
            return Err(backend_error(error));
        }
        metrics.frames_acquired.fetch_add(1, Ordering::Relaxed);
        let timestamp_ns = i64::try_from(started.elapsed().as_nanos()).unwrap_or(i64::MAX);
        match frame_sender.try_send(VideoFrame {
            rgba: rgba.clone(),
            timestamp_ns,
        }) {
            Ok(()) => {}
            Err(TrySendError::Full(_)) => {
                metrics.frames_dropped.fetch_add(1, Ordering::Relaxed);
            }
            Err(TrySendError::Disconnected(_)) => {
                return Err(CaptureError::Backend("macOS camera writer stopped".into()));
            }
        }
    }
    camera.stop_stream().map_err(backend_error)?;
    drop(frame_sender);
    writer.finish()?;
    Ok(metrics.frames_encoded())
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("macOS camera capture failed: {error}"))
}
