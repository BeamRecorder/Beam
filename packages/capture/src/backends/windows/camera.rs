use std::{
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use crossbeam_channel::{Receiver, Sender, TryRecvError, TrySendError, bounded};
use nokhwa::{
    pixel_format::RgbFormat,
    query,
    utils::{ApiBackend, CameraIndex},
};
use windows_capture::encoder::{
    AudioSettingsBuilder, ContainerSettingsBuilder, VideoEncoder, VideoSettingsBuilder,
    VideoSettingsSubType,
};

use crate::{
    CaptureError,
    backends::{camera_preview::open_camera, preview_stream::PreviewPublisher},
    clock::{LinearTimestampMapper, MonotonicClock, SessionClock, TimestampMapper},
    model::{
        MediaFormat, SourceCapabilities, SourceDescriptor, SourceId, SourceKind,
        SourceSelectionMode,
    },
    session::StartGate,
};

const MAX_CONSECUTIVE_CAPTURE_ERRORS: u32 = 5;

enum CameraMessage {
    Frame(Frame),
    End,
}

struct Frame {
    pts_ns: u64,
    width: u32,
    height: u32,
    bgra_bottom_up: Vec<u8>,
}

#[derive(Debug, Default)]
pub struct CameraCaptureMetrics {
    frames_received: AtomicU64,
    frames_encoded: AtomicU64,
    frames_dropped: AtomicU64,
    interruptions: AtomicU64,
}

impl CameraCaptureMetrics {
    #[must_use]
    pub fn frames_received(&self) -> u64 {
        self.frames_received.load(Ordering::Relaxed)
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
    stop: Option<Sender<()>>,
    capture: Option<JoinHandle<Result<(), CaptureError>>>,
    encoder: Option<JoinHandle<Result<(), CaptureError>>>,
    metrics: Arc<CameraCaptureMetrics>,
    output: PathBuf,
}

pub fn discover_sources() -> Result<Vec<SourceDescriptor>, CaptureError> {
    let cameras = query(ApiBackend::MediaFoundation).map_err(backend_error)?;
    cameras
        .into_iter()
        .enumerate()
        .map(|(position, camera)| {
            Ok(SourceDescriptor {
                id: SourceId::new(format!("camera:nokhwa:{}", camera.index().as_string()))?,
                kind: SourceKind::Camera,
                label: camera.human_name(),
                is_default: position == 0,
                selection_mode: SourceSelectionMode::Direct,
                display_id: None,
                capabilities: SourceCapabilities {
                    formats: vec![MediaFormat::Video {
                        width: 1280,
                        height: 720,
                        fps: 30,
                        pixel_format: Some("bgra8".into()),
                    }],
                    ..SourceCapabilities::default()
                },
            })
        })
        .collect()
}

impl WindowsCameraRecording {
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn start(
        source_id: &SourceId,
        output: &Path,
        bitrate: u32,
        target_fps: u32,
        queue_capacity: usize,
        start_gate: Arc<StartGate>,
        clock: Arc<SessionClock>,
        preview: Option<PreviewPublisher>,
    ) -> Result<Self, CaptureError> {
        if bitrate == 0 || target_fps == 0 || queue_capacity == 0 {
            return Err(CaptureError::InvalidConfiguration(
                "camera bitrate, fps and queue capacity must be non-zero".into(),
            ));
        }
        if output.exists() {
            std::fs::remove_file(output).map_err(backend_error)?;
        }

        let index = camera_index(source_id)?;
        let (sender, receiver) = bounded(queue_capacity);
        let (stop_sender, stop_receiver) = bounded(1);
        let metrics = Arc::new(CameraCaptureMetrics::default());

        let encoder_metrics = metrics.clone();
        let encoder_gate = start_gate.clone();
        let encoder_output = output.to_owned();
        let encoder = thread::Builder::new()
            .name("capture-camera-encoder".into())
            .spawn(move || {
                encode_frames(
                    receiver,
                    encoder_output,
                    bitrate,
                    target_fps,
                    encoder_gate,
                    encoder_metrics,
                )
            })
            .map_err(|error| CaptureError::Backend(error.to_string()))?;

        let capture_metrics = metrics.clone();
        let capture_gate = start_gate.clone();
        let capture = match thread::Builder::new()
            .name("capture-camera-input".into())
            .spawn(move || {
                capture_frames(
                    index,
                    sender,
                    stop_receiver,
                    capture_gate,
                    clock,
                    capture_metrics,
                    preview,
                )
            })
        {
            Ok(capture) => capture,
            Err(error) => {
                start_gate.cancel();
                let _ = encoder.join();
                let _ = std::fs::remove_file(output);
                return Err(CaptureError::Backend(error.to_string()));
            }
        };

        Ok(Self {
            stop: Some(stop_sender),
            capture: Some(capture),
            encoder: Some(encoder),
            metrics,
            output: output.to_owned(),
        })
    }

    pub fn stop(mut self) -> Result<(), CaptureError> {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        let capture_result = join_capture(self.capture.take());
        let encoder_result = join_encoder(self.encoder.take());
        if let Err(error) = capture_result {
            let _ = std::fs::remove_file(&self.output);
            return Err(error);
        }
        if let Err(error) = encoder_result {
            let _ = std::fs::remove_file(&self.output);
            return Err(error);
        }
        if self.metrics.frames_encoded() == 0 {
            let _ = std::fs::remove_file(&self.output);
            return Err(CaptureError::Backend(
                "native camera produced no encoded frames".into(),
            ));
        }
        if std::fs::metadata(&self.output)
            .map_err(backend_error)?
            .len()
            == 0
        {
            let _ = std::fs::remove_file(&self.output);
            return Err(CaptureError::Backend(
                "native camera produced an empty video file".into(),
            ));
        }
        Ok(())
    }

    #[must_use]
    pub fn metrics(&self) -> Arc<CameraCaptureMetrics> {
        self.metrics.clone()
    }
}

impl Drop for WindowsCameraRecording {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        if let Some(capture) = self.capture.take() {
            let _ = capture.join();
        }
        if let Some(encoder) = self.encoder.take() {
            let _ = encoder.join();
        }
    }
}

fn capture_frames(
    index: CameraIndex,
    sender: Sender<CameraMessage>,
    stop: Receiver<()>,
    gate: Arc<StartGate>,
    clock: Arc<SessionClock>,
    metrics: Arc<CameraCaptureMetrics>,
    preview: Option<PreviewPublisher>,
) -> Result<(), CaptureError> {
    let mut camera = open_camera(index)?;
    let start_ns = gate.wait()?;
    let mut mapper = None;
    let mut consecutive_errors = 0u32;

    loop {
        if matches!(stop.try_recv(), Ok(()) | Err(TryRecvError::Disconnected)) {
            break;
        }
        let buffer = match camera.frame() {
            Ok(frame) => {
                consecutive_errors = 0;
                frame
            }
            Err(error) => {
                consecutive_errors = consecutive_errors.saturating_add(1);
                metrics.interruptions.fetch_add(1, Ordering::Relaxed);
                if consecutive_errors >= MAX_CONSECUTIVE_CAPTURE_ERRORS {
                    return Err(backend_error(error));
                }
                thread::sleep(Duration::from_millis(10));
                continue;
            }
        };
        let resolution = buffer.resolution();
        let image = buffer.decode_image::<RgbFormat>().map_err(backend_error)?;
        if let Some(preview) = preview.as_ref()
            && preview
                .publish_rgb(image.as_raw(), resolution.width_x, resolution.height_y)
                .is_err()
        {
            metrics.interruptions.fetch_add(1, Ordering::Relaxed);
        }
        let bgra = rgb_to_bottom_up_bgra(image.as_raw(), resolution.width_x, resolution.height_y)?;
        let pts_ns = if let Some(native) = buffer.capture_timestamp() {
            let native_ns = u64::try_from(native.as_nanos()).unwrap_or(u64::MAX);
            if mapper.is_none() {
                mapper = Some(LinearTimestampMapper::new(native_ns, 0, 1_000_000_000)?);
            }
            mapper
                .as_mut()
                .and_then(|value| value.to_session_ns(native_ns).ok())
                .unwrap_or_else(|| clock.now_ns().saturating_sub(start_ns))
        } else {
            clock.now_ns().saturating_sub(start_ns)
        };
        metrics.frames_received.fetch_add(1, Ordering::Relaxed);
        match sender.try_send(CameraMessage::Frame(Frame {
            pts_ns,
            width: resolution.width_x,
            height: resolution.height_y,
            bgra_bottom_up: bgra,
        })) {
            Ok(()) => {}
            Err(TrySendError::Full(_)) => {
                metrics.frames_dropped.fetch_add(1, Ordering::Relaxed);
            }
            Err(TrySendError::Disconnected(_)) => break,
        }
    }
    let _ = sender.send(CameraMessage::End);
    Ok(())
}

fn encode_frames(
    receiver: Receiver<CameraMessage>,
    output: PathBuf,
    bitrate: u32,
    target_fps: u32,
    gate: Arc<StartGate>,
    metrics: Arc<CameraCaptureMetrics>,
) -> Result<(), CaptureError> {
    let _ = gate.wait()?;
    let first = receiver
        .recv()
        .map_err(|_| CaptureError::Backend("camera input stopped before its first frame".into()))?;
    let CameraMessage::Frame(first) = first else {
        return Err(CaptureError::Backend(
            "camera input produced no frame".into(),
        ));
    };
    let width = first.width;
    let height = first.height;
    let mut encoder = new_encoder(&output, width, height, bitrate, target_fps)?;
    encode_one(&mut encoder, first, &metrics)?;
    while let Ok(message) = receiver.recv() {
        let CameraMessage::Frame(frame) = message else {
            break;
        };
        if frame.width != width || frame.height != height {
            metrics.frames_dropped.fetch_add(1, Ordering::Relaxed);
            continue;
        }
        encode_one(&mut encoder, frame, &metrics)?;
    }
    encoder.finish().map_err(backend_error)
}

fn new_encoder(
    output: &Path,
    width: u32,
    height: u32,
    bitrate: u32,
    fps: u32,
) -> Result<VideoEncoder, CaptureError> {
    let video = VideoSettingsBuilder::new(width, height)
        .sub_type(VideoSettingsSubType::H264)
        .bitrate(bitrate)
        .frame_rate(fps);
    VideoEncoder::new(
        video,
        AudioSettingsBuilder::default().disabled(true),
        ContainerSettingsBuilder::default(),
        output,
    )
    .map_err(backend_error)
}

fn encode_one(
    encoder: &mut VideoEncoder,
    frame: Frame,
    metrics: &CameraCaptureMetrics,
) -> Result<(), CaptureError> {
    let timestamp = i64::try_from(frame.pts_ns / 100).unwrap_or(i64::MAX);
    encoder
        .send_frame_buffer(&frame.bgra_bottom_up, timestamp)
        .map_err(|error| {
            metrics.frames_dropped.fetch_add(1, Ordering::Relaxed);
            backend_error(error)
        })?;
    metrics.frames_encoded.fetch_add(1, Ordering::Relaxed);
    Ok(())
}

fn rgb_to_bottom_up_bgra(rgb: &[u8], width: u32, height: u32) -> Result<Vec<u8>, CaptureError> {
    let expected = usize::try_from(width)
        .ok()
        .and_then(|w| usize::try_from(height).ok().and_then(|h| w.checked_mul(h)))
        .and_then(|pixels| pixels.checked_mul(3))
        .ok_or_else(|| {
            CaptureError::InvalidConfiguration("camera frame dimensions overflow".into())
        })?;
    if rgb.len() != expected {
        return Err(CaptureError::Backend(
            "camera returned a frame with an unexpected size".into(),
        ));
    }
    let width = usize::try_from(width)
        .map_err(|_| CaptureError::InvalidConfiguration("camera width is too large".into()))?;
    let height = usize::try_from(height)
        .map_err(|_| CaptureError::InvalidConfiguration("camera height is too large".into()))?;
    let mut output = vec![0u8; expected / 3 * 4];
    for row in 0..height {
        for col in 0..width {
            let source = (row * width + col) * 3;
            let target = ((height - row - 1) * width + col) * 4;
            output[target..target + 4].copy_from_slice(&[
                rgb[source + 2],
                rgb[source + 1],
                rgb[source],
                255,
            ]);
        }
    }
    Ok(output)
}

fn camera_index(source_id: &SourceId) -> Result<CameraIndex, CaptureError> {
    let value = source_id
        .as_str()
        .strip_prefix("camera:nokhwa:")
        .ok_or_else(|| {
            CaptureError::InvalidConfiguration(format!("{source_id} is not a Nokhwa camera source"))
        })?;
    Ok(value.parse::<u32>().map_or_else(
        |_| CameraIndex::String(value.to_owned()),
        CameraIndex::Index,
    ))
}

fn join_capture(handle: Option<JoinHandle<Result<(), CaptureError>>>) -> Result<(), CaptureError> {
    handle
        .ok_or_else(|| CaptureError::Backend("camera capture handle missing".into()))?
        .join()
        .map_err(|_| CaptureError::Backend("camera capture thread panicked".into()))?
}

fn join_encoder(handle: Option<JoinHandle<Result<(), CaptureError>>>) -> Result<(), CaptureError> {
    handle
        .ok_or_else(|| CaptureError::Backend("camera encoder handle missing".into()))?
        .join()
        .map_err(|_| CaptureError::Backend("camera encoder thread panicked".into()))?
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("native camera failed: {error}"))
}

#[cfg(test)]
mod tests {
    use super::rgb_to_bottom_up_bgra;

    #[test]
    fn converts_rgb_to_bottom_up_bgra() {
        let converted = rgb_to_bottom_up_bgra(&[1, 2, 3, 4, 5, 6], 2, 1);
        assert!(converted.is_ok());
        assert_eq!(
            converted.unwrap_or_default(),
            vec![3, 2, 1, 255, 6, 5, 4, 255]
        );
    }

    #[test]
    fn rejects_wrong_rgb_buffer_size() {
        assert!(rgb_to_bottom_up_bgra(&[1, 2], 1, 1).is_err());
    }
}
