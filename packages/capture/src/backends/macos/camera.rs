use std::{
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use apple_cf::iosurface::{IOSurface, IOSurfaceLockOptions};
use avassetwriter::prelude::{AVWriterError, FileType, Writer};
use crossbeam_channel::{Receiver, Sender, TryRecvError, TrySendError, bounded};
use nokhwa::{
    pixel_format::RgbFormat,
    query,
    utils::{ApiBackend, CameraIndex},
};
use videotoolbox::prelude::{Codec, CompressionSession};

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

const VIDEO_TIMESCALE: i32 = 1_000_000_000;

enum CameraMessage {
    Frame(Frame),
    End,
}

struct Frame {
    pts_ns: u64,
    width: u32,
    height: u32,
    bgra: Vec<u8>,
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

pub struct MacCameraRecording {
    stop: Option<Sender<()>>,
    capture: Option<JoinHandle<Result<(), CaptureError>>>,
    encoder: Option<JoinHandle<Result<(), CaptureError>>>,
    metrics: Arc<CameraCaptureMetrics>,
    output: PathBuf,
}

pub fn discover_sources() -> Result<Vec<SourceDescriptor>, CaptureError> {
    let cameras = query(ApiBackend::AVFoundation).map_err(backend_error)?;
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

impl MacCameraRecording {
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
        let capture_metrics = metrics.clone();
        let capture_gate = start_gate.clone();
        let capture_clock = clock;
        let capture = thread::Builder::new()
            .name("capture-camera-input".into())
            .spawn(move || {
                capture_frames(
                    index,
                    sender,
                    stop_receiver,
                    capture_gate,
                    capture_clock,
                    capture_metrics,
                    preview,
                )
            })
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        let encoder_metrics = metrics.clone();
        let encoder_gate = start_gate;
        let encoder_output = output.to_owned();
        let encoder = thread::Builder::new()
            .name("capture-camera-videotoolbox".into())
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
        join_capture(self.capture.take())?;
        join_encoder(self.encoder.take())?;
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

impl Drop for MacCameraRecording {
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
    loop {
        if matches!(stop.try_recv(), Ok(()) | Err(TryRecvError::Disconnected)) {
            break;
        }
        let buffer = match camera.frame() {
            Ok(frame) => frame,
            Err(error) => {
                metrics.interruptions.fetch_add(1, Ordering::Relaxed);
                return Err(backend_error(error));
            }
        };
        let resolution = buffer.resolution();
        let image = buffer.decode_image::<RgbFormat>().map_err(backend_error)?;
        if let Some(preview) = preview.as_ref() {
            preview.publish_rgb(image.as_raw(), resolution.width_x, resolution.height_y)?;
        }
        let bgra = rgb_to_bgra(image.as_raw(), resolution.width_x, resolution.height_y)?;
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
            bgra,
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
    let width = i32::try_from(first.width)
        .map_err(|_| CaptureError::InvalidConfiguration("camera width exceeds i32".into()))?;
    let height = i32::try_from(first.height)
        .map_err(|_| CaptureError::InvalidConfiguration("camera height exceeds i32".into()))?;
    let fps = i32::try_from(target_fps)
        .map_err(|_| CaptureError::InvalidConfiguration("camera fps exceeds i32".into()))?;
    let surface = IOSurface::create(
        usize::try_from(first.width).map_err(backend_error)?,
        usize::try_from(first.height).map_err(backend_error)?,
        u32::from_be_bytes(*b"BGRA"),
        4,
    )
    .ok_or_else(|| CaptureError::Backend("failed to allocate camera IOSurface".into()))?;
    let encoder = CompressionSession::builder(width, height, Codec::H264)
        .with_real_time(true)
        .with_average_bit_rate(bitrate)
        .with_expected_frame_rate(f64::from(target_fps))
        .with_max_keyframe_interval(fps)
        .build()
        .map_err(backend_error)?;
    fill_surface(&surface, &first)?;
    let first_encoded = encoder
        .encode(&surface, (pts_value(first.pts_ns), VIDEO_TIMESCALE))
        .map_err(backend_error)?;
    let first_sample = first_encoded
        .cm_sample_buffer()
        .ok_or_else(|| CaptureError::Backend("VideoToolbox returned no first sample".into()))?;
    let writer = Writer::create(&output, FileType::Mp4).map_err(backend_error)?;
    let input = writer
        .add_video_input_from_sample(first_sample)
        .map_err(backend_error)?;
    writer
        .start_session((0, VIDEO_TIMESCALE))
        .map_err(backend_error)?;
    append_sample(&writer, input, first_sample)?;
    metrics.frames_encoded.fetch_add(1, Ordering::Relaxed);
    while let Ok(message) = receiver.recv() {
        let CameraMessage::Frame(frame) = message else {
            break;
        };
        if frame.width != first.width || frame.height != first.height {
            metrics.frames_dropped.fetch_add(1, Ordering::Relaxed);
            continue;
        }
        fill_surface(&surface, &frame)?;
        let encoded = encoder
            .encode(&surface, (pts_value(frame.pts_ns), VIDEO_TIMESCALE))
            .map_err(backend_error)?;
        let sample = encoded
            .cm_sample_buffer()
            .ok_or_else(|| CaptureError::Backend("VideoToolbox returned no sample".into()))?;
        append_sample(&writer, input, sample)?;
        metrics.frames_encoded.fetch_add(1, Ordering::Relaxed);
    }
    writer.finish().map_err(backend_error)
}

fn append_sample(
    writer: &Writer,
    input: usize,
    sample: &apple_cf::cm::CMSampleBuffer,
) -> Result<(), CaptureError> {
    loop {
        match writer.append_sample(input, sample) {
            Ok(()) => return Ok(()),
            Err(AVWriterError::InputNotReady) => thread::sleep(Duration::from_millis(1)),
            Err(error) => return Err(backend_error(error)),
        }
    }
}

fn fill_surface(surface: &IOSurface, frame: &Frame) -> Result<(), CaptureError> {
    let width = usize::try_from(frame.width).map_err(backend_error)?;
    let height = usize::try_from(frame.height).map_err(backend_error)?;
    let row_bytes = width
        .checked_mul(4)
        .ok_or_else(|| CaptureError::InvalidConfiguration("camera row size overflow".into()))?;
    if frame.bgra.len() != row_bytes.saturating_mul(height) {
        return Err(CaptureError::Backend(
            "camera BGRA frame has an unexpected size".into(),
        ));
    }
    let stride = surface.bytes_per_row();
    let mut guard = surface
        .lock(IOSurfaceLockOptions::NONE)
        .map_err(|status| CaptureError::Backend(format!("IOSurface lock failed: {status}")))?;
    let destination = guard
        .as_slice_mut()
        .ok_or_else(|| CaptureError::Backend("camera IOSurface is not contiguous".into()))?;
    for row in 0..height {
        let source_start = row.saturating_mul(row_bytes);
        let target_start = row.saturating_mul(stride);
        let target_end = target_start.saturating_add(row_bytes);
        if target_end > destination.len() {
            return Err(CaptureError::Backend(
                "camera IOSurface stride exceeds allocation".into(),
            ));
        }
        destination[target_start..target_end]
            .copy_from_slice(&frame.bgra[source_start..source_start + row_bytes]);
    }
    Ok(())
}

fn rgb_to_bgra(rgb: &[u8], width: u32, height: u32) -> Result<Vec<u8>, CaptureError> {
    let pixels = usize::try_from(width)
        .ok()
        .and_then(|w| usize::try_from(height).ok().and_then(|h| w.checked_mul(h)))
        .ok_or_else(|| {
            CaptureError::InvalidConfiguration("camera frame dimensions overflow".into())
        })?;
    if rgb.len() != pixels.saturating_mul(3) {
        return Err(CaptureError::Backend(
            "camera returned a frame with an unexpected size".into(),
        ));
    }
    let mut output = Vec::with_capacity(pixels.saturating_mul(4));
    for pixel in rgb.chunks_exact(3) {
        output.extend_from_slice(&[pixel[2], pixel[1], pixel[0], 255]);
    }
    Ok(output)
}

fn pts_value(pts_ns: u64) -> i64 {
    i64::try_from(pts_ns).unwrap_or(i64::MAX)
}

fn camera_index(source_id: &SourceId) -> Result<CameraIndex, CaptureError> {
    let value = source_id
        .as_str()
        .strip_prefix("camera:nokhwa:")
        .ok_or_else(|| {
            CaptureError::InvalidConfiguration(format!("{source_id} is not a Nokhwa camera source"))
        })?;
    let index = value.parse::<u32>().map_err(|error| {
        CaptureError::InvalidConfiguration(format!("invalid camera index: {error}"))
    })?;
    Ok(CameraIndex::Index(index))
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
    use super::rgb_to_bgra;

    #[test]
    fn converts_rgb_to_top_down_bgra() {
        assert_eq!(
            rgb_to_bgra(&[1, 2, 3, 4, 5, 6], 2, 1).unwrap_or_default(),
            vec![3, 2, 1, 255, 6, 5, 4, 255]
        );
    }

    #[test]
    fn rejects_wrong_rgb_buffer_size() {
        assert!(rgb_to_bgra(&[1, 2], 1, 1).is_err());
    }
}
