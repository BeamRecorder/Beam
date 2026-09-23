use crate::{
    CaptureError,
    model::{CursorSelection, ScreenRegion, ScreenSelection, SourceId},
    screen::{
        CursorSampleState, FrameTimestamp, OwnedScreenSample, OwnedVideoFrame, PixelFormat,
        ScreenCaptureMetrics, ScreenConsumer, ScreenOpenRequest, ScreenSampleSink, TimestampSource,
        VideoFormat, normalize_crop,
    },
};
use parking_lot::Mutex;
use std::{
    ffi::c_void,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};
use windows_capture::{
    capture::{CaptureControl, Context, GraphicsCaptureApiHandler},
    frame::Frame,
    graphics_capture_api::InternalCaptureControl,
    monitor::Monitor,
    settings::{ColorFormat, DirtyRegionSettings, GraphicsCaptureItemType, Settings},
    window::Window,
};

struct Handler {
    sink: Box<dyn ScreenSampleSink>,
    gate: Arc<crate::gate::StartGate>,
    region: Option<ScreenRegion>,
    metrics: Arc<ScreenCaptureMetrics>,
    unavailable: Arc<AtomicBool>,
    format: Option<VideoFormat>,
    sequence: u64,
}
impl GraphicsCaptureApiHandler for Handler {
    type Flags = Self;
    type Error = String;
    fn new(context: Context<Self::Flags>) -> Result<Self, String> {
        Ok(context.flags)
    }
    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        _: InternalCaptureControl,
    ) -> Result<(), String> {
        if !self.gate.is_released() {
            return Ok(());
        }
        let bounds = normalize_crop(
            self.region.unwrap_or(ScreenRegion {
                x: 0.,
                y: 0.,
                width: 1.,
                height: 1.,
            }),
            frame.width(),
            frame.height(),
        )
        .map_err(|e| e.to_string())?;
        let native_pts_ns = frame
            .timestamp()
            .ok()
            .and_then(|time| u64::try_from(time.Duration).ok())
            .and_then(|ticks| ticks.checked_mul(100));
        let buffer = frame
            .buffer_crop(bounds.start_x, bounds.start_y, bounds.end_x, bounds.end_y)
            .map_err(|e| e.to_string())?;
        let pixels = buffer.as_nopadding_buffer(&mut Vec::new()).to_vec();
        let format = VideoFormat {
            width: bounds.width(),
            height: bounds.height(),
            stride: bounds.width() as usize * 4,
            pixel_format: PixelFormat::Bgra8,
        };
        if self.format != Some(format) {
            self.sink
                .format_changed(format)
                .map_err(|e| e.to_string())?;
            self.format = Some(format);
        }
        self.sequence += 1;
        let result = self.sink.push(OwnedScreenSample {
            frame: OwnedVideoFrame {
                width: format.width,
                height: format.height,
                stride: format.stride,
                pixel_format: format.pixel_format,
                pixels: Arc::from(pixels),
            },
            timestamp: FrameTimestamp {
                session_ns: 0,
                native_pts_ns,
                source: TimestampSource::NativePresentation,
            },
            sequence: self.sequence,
            cursor: CursorSampleState::Unknown,
        });
        if result.is_err() {
            self.unavailable.store(true, Ordering::Release);
        }
        result.map_err(|e| e.to_string())?;
        self.metrics.received_frame(native_pts_ns, false);
        Ok(())
    }
    fn on_closed(&mut self) -> Result<(), String> {
        self.unavailable.store(true, Ordering::Release);
        self.sink.finish().map_err(|e| e.to_string())
    }
}

pub struct WindowsRecording {
    control: Option<CaptureControl<Handler, String>>,
    callback: Arc<Mutex<Handler>>,
    metrics: Arc<ScreenCaptureMetrics>,
    unavailable: Arc<AtomicBool>,
}
impl WindowsRecording {
    pub(crate) fn open(request: ScreenOpenRequest<'_>) -> Result<Self, CaptureError> {
        let ScreenSelection::Source { source_id } = request.selection else {
            return Err(CaptureError::InvalidConfiguration(
                "Windows requires a native source ID".into(),
            ));
        };
        if let Some(name) = source_id.as_str().strip_prefix("wgc:monitor:") {
            let monitor = Monitor::enumerate()
                .map_err(backend_error)?
                .into_iter()
                .find(|monitor| monitor.device_name().ok().as_deref() == Some(name))
                .ok_or_else(|| CaptureError::SourceNotFound(source_id.to_string()))?;
            return Self::item(monitor, request);
        }
        Self::item(window_from_source_id(source_id)?, request)
    }
    fn item<T: TryInto<GraphicsCaptureItemType> + Send + 'static>(
        item: T,
        request: ScreenOpenRequest<'_>,
    ) -> Result<Self, CaptureError> {
        let ScreenConsumer::Samples(sink) = request.consumer;
        let metrics = Arc::new(ScreenCaptureMetrics::default());
        let unavailable = Arc::new(AtomicBool::new(false));
        let flags = Handler {
            sink,
            gate: request.start_gate,
            region: request.region,
            metrics: metrics.clone(),
            unavailable: unavailable.clone(),
            format: None,
            sequence: 0,
        };
        let compatible = super::compatibility::compatible_settings(
            !matches!(request.cursor, CursorSelection::Embedded),
            request.recording.target_fps,
        );
        let settings = Settings::new(
            item,
            compatible.cursor,
            compatible.border,
            compatible.secondary_windows,
            compatible.minimum_update_interval,
            DirtyRegionSettings::Default,
            ColorFormat::Bgra8,
            flags,
        );
        let control = Handler::start_free_threaded(settings).map_err(backend_error)?;
        let callback = control.callback();
        Ok(Self {
            control: Some(control),
            callback,
            metrics,
            unavailable,
        })
    }
    pub fn stop(&mut self) -> Result<(), CaptureError> {
        let stopped = self
            .control
            .take()
            .map_or(Ok(()), |control| control.stop().map_err(backend_error));
        let finished = self.callback.lock().sink.finish();
        stopped.and(finished)
    }
    pub fn is_available(&self) -> bool {
        !self.unavailable.load(Ordering::Acquire)
    }
    pub fn video_format(&self) -> Option<VideoFormat> {
        self.callback.lock().format
    }
    pub fn metrics(&self) -> Arc<ScreenCaptureMetrics> {
        self.metrics.clone()
    }
}
impl Drop for WindowsRecording {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}
fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("Windows Graphics Capture: {error}"))
}
pub(super) fn window_from_source_id(source_id: &SourceId) -> Result<Window, CaptureError> {
    let s = source_id.as_str();
    let (raw, radix) = if let Some(raw) = s.strip_prefix("wgc:window:") {
        (raw, 16)
    } else if let Some(raw) = s.strip_prefix("window:") {
        (raw, 10)
    } else {
        return Err(CaptureError::InvalidConfiguration(format!(
            "{source_id} is not a Windows window source"
        )));
    };
    let token = raw.split(':').next().unwrap_or(raw);
    let hwnd = usize::from_str_radix(token, radix).map_err(|error| {
        CaptureError::InvalidConfiguration(format!(
            "invalid Windows window handle {token}: {error}"
        ))
    })?;
    if hwnd == 0 {
        return Err(CaptureError::SourceNotFound(source_id.to_string()));
    }
    let window = Window::from_raw_hwnd(hwnd as *mut c_void);
    if !window.is_valid() {
        return Err(CaptureError::SourceNotFound(source_id.to_string()));
    }
    Ok(window)
}

#[path = "../../../test/screen/win/capture.rs"]
mod capture_checks;
