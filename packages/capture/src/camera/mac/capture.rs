use std::{
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc,
    },
    thread::JoinHandle,
    time::Instant,
};

use cameras::{Device, StreamConfig};
use crossbeam_channel::TrySendError;

use crate::{CaptureError, camera::select_format, model::CameraSelection, session::StartGate};

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
    format: StreamConfig,
}

impl MacCameraRecording {
    pub fn start(
        selection: &CameraSelection,
        output: &Path,
        start_gate: Arc<StartGate>,
        queue_capacity: usize,
    ) -> Result<Self, CaptureError> {
        if queue_capacity == 0 {
            return Err(CaptureError::InvalidConfiguration(
                "camera queue capacity must be non-zero".into(),
            ));
        }
        let device = selected_device(selection)?;
        let config = select_format(&cameras::probe(&device).map_err(backend_error)?, selection)?;
        let cancel = Arc::new(AtomicBool::new(false));
        let metrics = Arc::new(MacCameraMetrics::default());
        let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
        let thread = std::thread::Builder::new()
            .name("capture-macos-camera".into())
            .spawn({
                let cancel = Arc::clone(&cancel);
                let metrics = Arc::clone(&metrics);
                let output = output.to_owned();
                move || {
                    camera_loop(
                        device,
                        config,
                        output,
                        queue_capacity,
                        start_gate,
                        cancel,
                        metrics,
                        ready_sender,
                    )
                }
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
        Arc::clone(&self.metrics)
    }
    #[must_use]
    pub const fn format(&self) -> StreamConfig {
        self.format
    }

    fn finish(&mut self) -> Result<u64, CaptureError> {
        self.cancel.store(true, Ordering::Release);
        self.thread
            .take()
            .map_or(Ok(self.metrics.frames_encoded()), |thread| {
                thread
                    .join()
                    .map_err(|_| CaptureError::Backend("macOS camera thread panicked".into()))?
            })
    }
}

impl Drop for MacCameraRecording {
    fn drop(&mut self) {
        let _result = self.finish();
    }
}

#[allow(clippy::too_many_arguments)]
fn camera_loop(
    device: Device,
    config: StreamConfig,
    output: PathBuf,
    queue_capacity: usize,
    start_gate: Arc<StartGate>,
    cancel: Arc<AtomicBool>,
    metrics: Arc<MacCameraMetrics>,
    ready: mpsc::SyncSender<Result<StreamConfig, CaptureError>>,
) -> Result<u64, CaptureError> {
    let camera = match cameras::open(&device, config) {
        Ok(camera) => camera,
        Err(error) => {
            let _sent = ready.send(Err(backend_error(error)));
            return Err(CaptureError::Backend("camera failed to open".into()));
        }
    };
    let format = camera.config;
    let (frame_sender, writer) = spawn_writer(
        &output,
        format.resolution.width,
        format.resolution.height,
        queue_capacity,
        Arc::clone(&metrics),
    )?;
    ready
        .send(Ok(format))
        .map_err(|_| CaptureError::Backend("camera startup receiver closed".into()))?;
    start_gate.wait()?;
    let started = Instant::now();
    let capture_result = loop {
        if cancel.load(Ordering::Acquire) {
            break Ok(());
        }
        let frame = match cameras::next_frame(&camera, cameras::DEFAULT_FRAME_TIMEOUT) {
            Ok(frame) => frame,
            Err(cameras::Error::Timeout) => continue,
            Err(error) => {
                metrics.interruptions.fetch_add(1, Ordering::Relaxed);
                break Err(backend_error(error));
            }
        };
        metrics.frames_acquired.fetch_add(1, Ordering::Relaxed);
        let rgba = cameras::to_rgba8(&frame).map_err(backend_error)?;
        let timestamp_ns = i64::try_from(started.elapsed().as_nanos()).unwrap_or(i64::MAX);
        match frame_sender.try_send(VideoFrame { rgba, timestamp_ns }) {
            Ok(()) => {}
            Err(TrySendError::Full(_)) => {
                metrics.frames_dropped.fetch_add(1, Ordering::Relaxed);
            }
            Err(TrySendError::Disconnected(_)) => {
                metrics.interruptions.fetch_add(1, Ordering::Relaxed);
                break Err(CaptureError::Backend("macOS camera writer stopped".into()));
            }
        }
    };
    drop(frame_sender);
    let writer_result = writer.finish();
    capture_result?;
    writer_result?;
    Ok(metrics.frames_encoded())
}

fn selected_device(selection: &CameraSelection) -> Result<Device, CaptureError> {
    let id = selection
        .source_id
        .as_str()
        .strip_prefix("camera:")
        .ok_or_else(|| CaptureError::InvalidConfiguration("invalid camera source ID".into()))?;
    cameras::devices()
        .map_err(backend_error)?
        .into_iter()
        .find(|device| device.id.0 == id)
        .ok_or_else(|| CaptureError::SourceNotFound(selection.source_id.to_string()))
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("macOS camera capture failed: {error}"))
}
