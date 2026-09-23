use crate::{
    CaptureError,
    model::{CursorSelection, ScreenSelection},
    screen::{
        CursorSampleState, FrameTimestamp, OwnedScreenSample, OwnedVideoFrame, PixelFormat,
        ScreenCaptureMetrics, ScreenConsumer, ScreenOpenRequest, TimestampSource, VideoFormat,
    },
};
use screencapturekit::{
    cm::{CMSampleBufferExt, CMTime},
    shareable_content::SCShareableContent,
    stream::{
        SCStream, StreamCallbacks,
        configuration::{PixelFormat as NativePixelFormat, SCStreamConfiguration},
        output_type::SCStreamOutputType,
    },
};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, AtomicU64, Ordering},
};

pub struct MacRecording {
    stream: Option<SCStream>,
    frame_handler: usize,
    metrics: Arc<ScreenCaptureMetrics>,
    unavailable: Arc<AtomicBool>,
    error: Arc<Mutex<Option<String>>>,
    sink: Arc<Mutex<Box<dyn crate::screen::ScreenSampleSink>>>,
    format: VideoFormat,
}
impl MacRecording {
    pub(crate) fn open(request: ScreenOpenRequest<'_>) -> Result<Self, CaptureError> {
        let ScreenSelection::Source { source_id } = request.selection else {
            return Err(CaptureError::InvalidConfiguration(
                "macOS requires a native source ID".into(),
            ));
        };
        let content = SCShareableContent::get().map_err(backend_error)?;
        let (filter, width, height, rect) = super::resolve_filter(
            &content,
            source_id,
            request.region,
            request.excluded_window_handles,
        )?;
        let mut config = SCStreamConfiguration::new()
            .with_width(width)
            .with_height(height)
            .with_pixel_format(NativePixelFormat::BGRA)
            .with_queue_depth(3)
            .with_minimum_frame_interval(&CMTime::new(
                1,
                i32::try_from(request.recording.target_fps).map_err(backend_error)?,
            ))
            .with_shows_cursor(matches!(request.cursor, CursorSelection::Embedded))
            .with_captures_audio(false);
        if let Some(rect) = rect {
            config = config.with_source_rect(rect);
        }
        let ScreenConsumer::Samples(sink) = request.consumer;
        let sink = Arc::new(Mutex::new(sink));
        let metrics = Arc::new(ScreenCaptureMetrics::default());
        let unavailable = Arc::new(AtomicBool::new(false));
        let error = Arc::new(Mutex::new(None));
        let error_state = error.clone();
        let failed = unavailable.clone();
        let inactive = unavailable.clone();
        let delegate = StreamCallbacks::new()
            .on_error(move |reason| {
                *error_state
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(reason.to_string());
                failed.store(true, Ordering::Release);
            })
            .on_inactive(move || inactive.store(true, Ordering::Release));
        let mut stream = SCStream::new_with_delegate(&filter, &config, delegate);
        let sequence = AtomicU64::new(0);
        let callback_sink = sink.clone();
        let callback_metrics = metrics.clone();
        let callback_error = error.clone();
        let callback_unavailable = unavailable.clone();
        let frame_handler = stream
            .add_output_handler(
                move |sample: screencapturekit::cm::CMSampleBuffer, _| {
                    if !request_gate_released(&request.start_gate) {
                        return;
                    }
                    let Some(buffer) = sample.image_buffer() else {
                        return;
                    };
                    let result = (|| -> Result<(), CaptureError> {
                        let guard = buffer.lock_read_only().map_err(backend_error)?;
                        let width = u32::try_from(guard.width()).map_err(backend_error)?;
                        let height = u32::try_from(guard.height()).map_err(backend_error)?;
                        let stride = guard.bytes_per_row();
                        let bytes = stride
                            .checked_mul(height as usize)
                            .filter(|size| *size <= guard.as_slice().len())
                            .ok_or_else(|| backend_error("invalid ScreenCaptureKit buffer size"))?;
                        let frame = OwnedVideoFrame {
                            width,
                            height,
                            stride,
                            pixel_format: PixelFormat::Bgra8,
                            pixels: Arc::from(&guard.as_slice()[..bytes]),
                        };
                        let pts = sample.presentation_timestamp();
                        let native_pts_ns = if pts.timescale > 0 {
                            u64::try_from(
                                i128::from(pts.value) * 1_000_000_000 / i128::from(pts.timescale),
                            )
                            .ok()
                        } else {
                            None
                        };
                        let sample = OwnedScreenSample {
                            frame,
                            sequence: sequence.fetch_add(1, Ordering::Relaxed),
                            cursor: CursorSampleState::Unknown,
                            timestamp: FrameTimestamp {
                                session_ns: 0,
                                native_pts_ns,
                                source: TimestampSource::NativePresentation,
                            },
                        };
                        callback_sink
                            .lock()
                            .unwrap_or_else(std::sync::PoisonError::into_inner)
                            .push(sample)?;
                        callback_metrics.received_frame(native_pts_ns, false);
                        Ok(())
                    })();
                    if let Err(reason) = result {
                        *callback_error
                            .lock()
                            .unwrap_or_else(std::sync::PoisonError::into_inner) =
                            Some(reason.to_string());
                        callback_unavailable.store(true, Ordering::Release);
                    }
                },
                SCStreamOutputType::Screen,
            )
            .ok_or_else(|| backend_error("ScreenCaptureKit rejected the screen output"))?;
        stream.start_capture().map_err(backend_error)?;
        Ok(Self {
            stream: Some(stream),
            frame_handler,
            metrics,
            unavailable,
            error,
            sink,
            format: VideoFormat {
                width,
                height,
                stride: width as usize * 4,
                pixel_format: PixelFormat::Bgra8,
            },
        })
    }
    pub fn metrics(&self) -> Arc<ScreenCaptureMetrics> {
        self.metrics.clone()
    }
    pub fn is_available(&self) -> bool {
        !self.unavailable.load(Ordering::Acquire)
    }
    pub fn video_format(&self) -> Option<VideoFormat> {
        Some(self.format)
    }
    pub fn stop(&mut self) -> Result<(), CaptureError> {
        if let Some(mut stream) = self.stream.take() {
            stream.stop_capture().map_err(backend_error)?;
            stream.remove_output_handler(self.frame_handler, SCStreamOutputType::Screen);
            self.sink
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .finish()?;
        }
        self.error
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take()
            .map_or(Ok(()), |reason| Err(backend_error(reason)))
    }
}
fn request_gate_released(gate: &crate::gate::StartGate) -> bool {
    gate.is_released()
}
fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("ScreenCaptureKit: {error}"))
}
impl Drop for MacRecording {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

#[path = "../../../test/screen/mac/capture.rs"]
mod capture_checks;
