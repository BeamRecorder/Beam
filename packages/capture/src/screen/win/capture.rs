use std::{
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};

use parking_lot::Mutex;
use windows_capture::{
    capture::{CaptureControl, Context, GraphicsCaptureApiHandler},
    encoder::{
        AudioSettingsBuilder, ContainerSettingsBuilder, VideoEncoder, VideoSettingsBuilder,
        VideoSettingsSubType,
    },
    frame::Frame,
    graphics_capture_api::InternalCaptureControl,
    monitor::Monitor,
    settings::{
        ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
        GraphicsCaptureItemType, MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
    },
    window::Window,
};

use crate::{CaptureError, model::SourceId, session::StartGate};

#[derive(Debug, Default)]
pub struct WindowsCaptureMetrics {
    frames_received: AtomicU64,
    frames_dropped: AtomicU64,
}

impl WindowsCaptureMetrics {
    #[must_use]
    pub fn frames_received(&self) -> u64 {
        self.frames_received.load(Ordering::Relaxed)
    }

    #[must_use]
    pub fn frames_dropped(&self) -> u64 {
        self.frames_dropped.load(Ordering::Relaxed)
    }
}

struct HandlerFlags {
    output: PathBuf,
    width: u32,
    height: u32,
    bitrate: u32,
    fps: u32,
    metrics: Arc<WindowsCaptureMetrics>,
    start_gate: Arc<StartGate>,
}

struct CaptureHandler {
    encoder: Option<VideoEncoder>,
    metrics: Arc<WindowsCaptureMetrics>,
    start_gate: Arc<StartGate>,
}

impl CaptureHandler {
    fn finish(&mut self) -> Result<(), CaptureError> {
        if let Some(encoder) = self.encoder.take() {
            encoder
                .finish()
                .map_err(|error| CaptureError::Backend(error.to_string()))?;
        }
        Ok(())
    }
}

impl GraphicsCaptureApiHandler for CaptureHandler {
    type Flags = HandlerFlags;
    type Error = String;

    fn new(context: Context<Self::Flags>) -> Result<Self, Self::Error> {
        let flags = context.flags;
        let video = VideoSettingsBuilder::new(flags.width, flags.height)
            .sub_type(VideoSettingsSubType::H264)
            .bitrate(flags.bitrate)
            .frame_rate(flags.fps);
        let encoder = VideoEncoder::new(
            video,
            AudioSettingsBuilder::default().disabled(true),
            ContainerSettingsBuilder::default(),
            &flags.output,
        )
        .map_err(|error| error.to_string())?;
        Ok(Self {
            encoder: Some(encoder),
            metrics: flags.metrics,
            start_gate: flags.start_gate,
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        _capture_control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        if !self.start_gate.is_released() {
            self.start_gate.wait().map_err(|error| error.to_string())?;
        }
        self.encoder
            .as_mut()
            .ok_or_else(|| "video encoder was finalized".to_owned())?
            .send_frame(frame)
            .map_err(|error| {
                self.metrics.frames_dropped.fetch_add(1, Ordering::Relaxed);
                error.to_string()
            })?;
        self.metrics.frames_received.fetch_add(1, Ordering::Relaxed);
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        self.finish().map_err(|error| error.to_string())
    }
}

type Control = CaptureControl<CaptureHandler, String>;

pub struct WindowsRecording {
    control: Option<Control>,
    callback: Arc<Mutex<CaptureHandler>>,
    metrics: Arc<WindowsCaptureMetrics>,
}

impl WindowsRecording {
    pub fn start(
        source_id: &SourceId,
        output: &Path,
        bitrate: u32,
        fps: u32,
        exclude_cursor: bool,
        start_gate: Arc<StartGate>,
    ) -> Result<Self, CaptureError> {
        if bitrate == 0 || fps == 0 {
            return Err(CaptureError::InvalidConfiguration(
                "video bitrate and fps must be non-zero".into(),
            ));
        }
        if let Some(device_name) = source_id.as_str().strip_prefix("wgc:monitor:") {
            let monitor = Monitor::enumerate()
                .map_err(backend_error)?
                .into_iter()
                .find(|monitor| monitor.device_name().ok().as_deref() == Some(device_name))
                .ok_or_else(|| CaptureError::SourceNotFound(source_id.to_string()))?;
            let size = (
                monitor.width().map_err(backend_error)?,
                monitor.height().map_err(backend_error)?,
            );
            return start_item(
                monitor,
                output,
                size,
                bitrate,
                fps,
                exclude_cursor,
                start_gate,
            );
        }
        if source_id.as_str().starts_with("wgc:window:") {
            let window = Window::enumerate()
                .map_err(backend_error)?
                .into_iter()
                .find(|window| window_id(*window).is_ok_and(|id| &id == source_id))
                .ok_or_else(|| CaptureError::SourceNotFound(source_id.to_string()))?;
            let width = u32::try_from(window.width().map_err(backend_error)?.max(1))
                .map_err(backend_error)?;
            let height = u32::try_from(window.height().map_err(backend_error)?.max(1))
                .map_err(backend_error)?;
            return start_item(
                window,
                output,
                (width, height),
                bitrate,
                fps,
                exclude_cursor,
                start_gate,
            );
        }
        Err(CaptureError::InvalidConfiguration(format!(
            "{source_id} is not a Windows screen source"
        )))
    }

    pub fn stop(mut self) -> Result<(), CaptureError> {
        if let Some(control) = self.control.take() {
            control.stop().map_err(backend_error)?;
        }
        self.callback.lock().finish()
    }

    #[must_use]
    pub fn metrics(&self) -> Arc<WindowsCaptureMetrics> {
        self.metrics.clone()
    }
}

impl Drop for WindowsRecording {
    fn drop(&mut self) {
        if let Some(control) = self.control.take() {
            let _result = control.stop();
        }
        let _result = self.callback.lock().finish();
    }
}

fn start_item<T>(
    item: T,
    output: &Path,
    size: (u32, u32),
    bitrate: u32,
    fps: u32,
    exclude_cursor: bool,
    start_gate: Arc<StartGate>,
) -> Result<WindowsRecording, CaptureError>
where
    T: TryInto<GraphicsCaptureItemType> + Send + 'static,
{
    let metrics = Arc::new(WindowsCaptureMetrics::default());
    let flags = HandlerFlags {
        output: output.to_owned(),
        width: size.0,
        height: size.1,
        bitrate,
        fps,
        metrics: metrics.clone(),
        start_gate,
    };
    let settings = Settings::new(
        item,
        if exclude_cursor {
            CursorCaptureSettings::WithoutCursor
        } else {
            CursorCaptureSettings::WithCursor
        },
        DrawBorderSettings::WithoutBorder,
        SecondaryWindowSettings::Exclude,
        MinimumUpdateIntervalSettings::Custom(std::time::Duration::from_secs_f64(
            1.0 / f64::from(fps),
        )),
        DirtyRegionSettings::Default,
        ColorFormat::Bgra8,
        flags,
    );
    let control = CaptureHandler::start_free_threaded(settings).map_err(backend_error)?;
    let callback = control.callback();
    Ok(WindowsRecording {
        control: Some(control),
        callback,
        metrics,
    })
}

fn window_id(window: Window) -> Result<SourceId, CaptureError> {
    SourceId::new(format!("wgc:window:{:x}", window.as_raw_hwnd() as usize))
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("Windows Graphics Capture failed: {error}"))
}
