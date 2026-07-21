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
use crossbeam_channel::{TrySendError, bounded};
use windows_capture::encoder::{
    AudioSettingsBuilder, ContainerSettingsBuilder, VideoEncoder, VideoSettingsBuilder,
    VideoSettingsSubType,
};

use crate::{CaptureError, camera::select_format, model::CameraSelection, session::StartGate};

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
    format: StreamConfig,
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
        let device = selected_device(selection)?;
        let config = select_format(&cameras::probe(&device).map_err(backend_error)?, selection)?;
        let cancel = Arc::new(AtomicBool::new(false));
        let metrics = Arc::new(CameraCaptureMetrics::default());
        let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
        let thread = std::thread::Builder::new()
            .name("capture-windows-camera".into())
            .spawn({
                let cancel = Arc::clone(&cancel);
                let metrics = Arc::clone(&metrics);
                let output = output.to_owned();
                move || {
                    camera_loop(
                        device,
                        config,
                        output,
                        bitrate,
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
    pub fn metrics(&self) -> Arc<CameraCaptureMetrics> {
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
                    .map_err(|_| CaptureError::Backend("camera thread panicked".into()))?
            })
    }
}

impl Drop for WindowsCameraRecording {
    fn drop(&mut self) {
        let _result = self.finish();
    }
}

#[allow(clippy::too_many_arguments)]
fn camera_loop(
    device: Device,
    config: StreamConfig,
    output: PathBuf,
    bitrate: u32,
    queue_capacity: usize,
    start_gate: Arc<StartGate>,
    cancel: Arc<AtomicBool>,
    metrics: Arc<CameraCaptureMetrics>,
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
    let (frame_sender, frame_receiver) = bounded::<EncodedFrame>(queue_capacity);
    let (encoder_ready_sender, encoder_ready_receiver) =
        mpsc::sync_channel::<Result<(), CaptureError>>(1);
    let writer_metrics = Arc::clone(&metrics);
    let encoder = std::thread::Builder::new()
        .name("capture-windows-camera-encoder".into())
        .spawn(move || {
            let video =
                VideoSettingsBuilder::new(format.resolution.width, format.resolution.height)
                    .sub_type(VideoSettingsSubType::H264)
                    .bitrate(bitrate)
                    .frame_rate(format.framerate);
            let mut encoder = VideoEncoder::new(
                video,
                AudioSettingsBuilder::default().disabled(true),
                ContainerSettingsBuilder::default(),
                &output,
            )
            .map_err(backend_error)?;
            let _sent = encoder_ready_sender.send(Ok(()));
            while let Ok(frame) = frame_receiver.recv() {
                encoder
                    .send_frame_buffer(&frame.buffer, frame.timestamp_100ns)
                    .map_err(backend_error)?;
                writer_metrics
                    .frames_encoded
                    .fetch_add(1, Ordering::Relaxed);
            }
            encoder.finish().map_err(backend_error)
        })
        .map_err(backend_error)?;
    encoder_ready_receiver
        .recv()
        .map_err(|_| CaptureError::Backend("camera encoder startup channel closed".into()))??;
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
        let mut rgba = cameras::to_rgba8(&frame).map_err(backend_error)?;
        rgba_to_bottom_up_bgra(&mut rgba, format.resolution.width, format.resolution.height);
        let timestamp_100ns = i64::try_from(started.elapsed().as_nanos() / 100).unwrap_or(i64::MAX);
        match frame_sender.try_send(EncodedFrame {
            buffer: rgba,
            timestamp_100ns,
        }) {
            Ok(()) => {}
            Err(TrySendError::Full(_)) => {
                metrics.frames_dropped.fetch_add(1, Ordering::Relaxed);
            }
            Err(TrySendError::Disconnected(_)) => {
                metrics.interruptions.fetch_add(1, Ordering::Relaxed);
                break Err(CaptureError::Backend(
                    "camera encoder stopped unexpectedly".into(),
                ));
            }
        }
    };
    drop(frame_sender);
    let encoder_result = encoder
        .join()
        .map_err(|_| CaptureError::Backend("camera encoder thread panicked".into()))?;
    capture_result?;
    encoder_result?;
    Ok(metrics.frames_encoded())
}

struct EncodedFrame {
    buffer: Vec<u8>,
    timestamp_100ns: i64,
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

fn rgba_to_bottom_up_bgra(buffer: &mut [u8], width: u32, height: u32) {
    for pixel in buffer.chunks_exact_mut(4) {
        pixel.swap(0, 2);
    }
    let stride = usize::try_from(width)
        .unwrap_or(usize::MAX)
        .saturating_mul(4);
    for row in 0..usize::try_from(height).unwrap_or(usize::MAX) / 2 {
        let opposite = usize::try_from(height).unwrap_or(usize::MAX) - row - 1;
        let (before, after) = buffer.split_at_mut(opposite * stride);
        before[row * stride..(row + 1) * stride].swap_with_slice(&mut after[..stride]);
    }
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("camera capture failed: {error}"))
}
