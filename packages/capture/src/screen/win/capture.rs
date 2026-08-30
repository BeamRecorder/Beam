use std::{
    ffi::c_void,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
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
    settings::{ColorFormat, DirtyRegionSettings, GraphicsCaptureItemType, Settings},
    window::Window,
};

use super::compatibility::compatible_settings;

use crate::{
    CaptureError,
    model::{ScreenRegion, SourceId},
    screen::{
        PixelCrop, ScreenCaptureMetrics, ScreenConsumer, ScreenOpenRequest, even_dimension,
        normalize_crop,
    },
    session::StartGate,
};

struct HandlerFlags {
    output: PathBuf,
    width: u32,
    height: u32,
    bitrate: u32,
    fps: u32,
    metrics: Arc<ScreenCaptureMetrics>,
    start_gate: Arc<StartGate>,
    region: Option<ScreenRegion>,
    unavailable: Arc<AtomicBool>,
}

struct PendingEncoder {
    output: PathBuf,
    bitrate: u32,
    fps: u32,
    candidate_crop_size: Option<(u32, u32)>,
}

struct CaptureHandler {
    encoder: Option<VideoEncoder>,
    pending_encoder: Option<PendingEncoder>,
    metrics: Arc<ScreenCaptureMetrics>,
    start_gate: Arc<StartGate>,
    region: Option<ScreenRegion>,
    crop: Option<PixelCrop>,
    encoded_size: Option<(u32, u32)>,
    unavailable: Arc<AtomicBool>,
}

impl CaptureHandler {
    fn create_encoder(
        settings: &PendingEncoder,
        width: u32,
        height: u32,
    ) -> Result<VideoEncoder, String> {
        let video = VideoSettingsBuilder::new(width, height)
            .sub_type(VideoSettingsSubType::H264)
            .bitrate(settings.bitrate)
            .frame_rate(settings.fps);
        VideoEncoder::new(
            video,
            AudioSettingsBuilder::default().disabled(true),
            ContainerSettingsBuilder::default(),
            &settings.output,
        )
        .map_err(|error| error.to_string())
    }

    fn finish(&mut self) -> Result<(), CaptureError> {
        self.pending_encoder = None;
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
        let settings = PendingEncoder {
            output: flags.output,
            bitrate: flags.bitrate,
            fps: flags.fps,
            candidate_crop_size: flags.region.map(|_| (flags.width, flags.height)),
        };
        // A region's encoded dimensions must come from the WGC texture, not
        // from the monitor catalog. Windows can report those sizes in
        // different coordinate spaces when DPI scaling is active.
        let (encoder, pending_encoder) = if flags.region.is_some() {
            (None, Some(settings))
        } else {
            (
                Some(Self::create_encoder(&settings, flags.width, flags.height)?),
                None,
            )
        };
        Ok(Self {
            encoder,
            pending_encoder,
            metrics: flags.metrics,
            start_gate: flags.start_gate,
            region: flags.region,
            crop: None,
            encoded_size: flags
                .region
                .is_none()
                .then_some((flags.width, flags.height)),
            unavailable: flags.unavailable,
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
        let crop = if let Some(region) = self.region {
            let frame_crop = normalize_crop(region, frame.width(), frame.height())
                .map_err(|error| error.to_string())?;
            if let Some(encoder_crop) = self.crop {
                if frame_crop.width() != encoder_crop.width()
                    || frame_crop.height() != encoder_crop.height()
                {
                    return Err("captured frame dimensions changed during region recording".into());
                }
            } else {
                let candidate_size = (frame_crop.width(), frame_crop.height());
                let pending = self
                    .pending_encoder
                    .as_mut()
                    .ok_or_else(|| "video encoder was finalized".to_owned())?;
                if pending.candidate_crop_size != Some(candidate_size) {
                    pending.candidate_crop_size = Some(candidate_size);
                    self.metrics.dropped_frames(1);
                    return Ok(());
                }
                let settings = self.pending_encoder.take().ok_or_else(|| {
                    "video encoder settings disappeared during initialization".to_owned()
                })?;
                self.encoder = Some(Self::create_encoder(
                    &settings,
                    frame_crop.width(),
                    frame_crop.height(),
                )?);
                self.crop = Some(frame_crop);
                self.encoded_size = Some(candidate_size);
            }
            Some(frame_crop)
        } else {
            None
        };
        let encoder = self
            .encoder
            .as_mut()
            .ok_or_else(|| "video encoder was finalized".to_owned())?;
        let result = if let Some(crop) = crop {
            let timestamp = frame
                .timestamp()
                .map_err(|error| error.to_string())?
                .Duration;
            let cropped = frame
                .buffer_crop(crop.start_x, crop.start_y, crop.end_x, crop.end_y)
                .map_err(|error| error.to_string())?;
            let mut compact = Vec::new();
            let bytes = cropped.as_nopadding_buffer(&mut compact);
            // The raw-buffer encoder expects BGRA rows bottom-to-top, while
            // Graphics Capture gives us the crop in the normal top-to-bottom
            // screen order. The direct-frame path performs this conversion
            // internally; do it explicitly for cropped frames as well.
            let bottom_up = flip_bgra_rows(bytes, crop.width(), crop.height());
            encoder.send_frame_buffer(&bottom_up, timestamp)
        } else {
            encoder.send_frame(frame)
        };
        result.map_err(|error| {
            self.metrics.dropped_frames(1);
            error.to_string()
        })?;
        self.metrics.received_frame(None, false);
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        self.unavailable.store(true, Ordering::Release);
        self.finish().map_err(|error| error.to_string())
    }
}

fn flip_bgra_rows(bytes: &[u8], width: u32, height: u32) -> Vec<u8> {
    let row_bytes = width as usize * 4;
    let row_count = height as usize;
    let mut flipped = Vec::with_capacity(bytes.len());
    for row in (0..row_count).rev() {
        let start = row * row_bytes;
        flipped.extend_from_slice(&bytes[start..start + row_bytes]);
    }
    flipped
}

type Control = CaptureControl<CaptureHandler, String>;

pub struct WindowsRecording {
    control: Option<Control>,
    callback: Arc<Mutex<CaptureHandler>>,
    metrics: Arc<ScreenCaptureMetrics>,
    output: PathBuf,
    unavailable: Arc<AtomicBool>,
}

impl WindowsRecording {
    pub(crate) fn open(request: ScreenOpenRequest<'_>) -> Result<Self, CaptureError> {
        let crate::model::ScreenSelection::Source { source_id } = request.selection else {
            return Err(CaptureError::InvalidConfiguration(
                "Windows screen capture requires a direct source".into(),
            ));
        };
        let ScreenConsumer::EncodedFile { path, .. } = request.consumer else {
            return Err(CaptureError::Unsupported(
                "Windows raw screen samples are not available".into(),
            ));
        };
        Self::start(
            source_id,
            &path,
            u32::try_from(request.recording.video_bitrate_bps).unwrap_or(u32::MAX),
            request.recording.target_fps,
            matches!(
                request.cursor,
                crate::model::CursorSelection::Separate { .. }
            ),
            request.region,
            request.start_gate,
        )
    }

    pub fn start(
        source_id: &SourceId,
        output: &Path,
        bitrate: u32,
        fps: u32,
        exclude_cursor: bool,
        region: Option<ScreenRegion>,
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
                StartItemConfig {
                    output,
                    size,
                    bitrate,
                    fps,
                    exclude_cursor,
                    region,
                    start_gate,
                },
            );
        }
        if source_id.as_str().starts_with("wgc:window:")
            || source_id.as_str().starts_with("window:")
        {
            let window = window_from_source_id(source_id)?;
            let width = u32::try_from(window.width().map_err(backend_error)?.max(1))
                .map_err(backend_error)?;
            let height = u32::try_from(window.height().map_err(backend_error)?.max(1))
                .map_err(backend_error)?;
            return start_item(
                window,
                StartItemConfig {
                    output,
                    size: (width, height),
                    bitrate,
                    fps,
                    exclude_cursor,
                    region: None,
                    start_gate,
                },
            );
        }
        Err(CaptureError::InvalidConfiguration(format!(
            "{source_id} is not a Windows screen source"
        )))
    }

    pub fn stop(&mut self) -> Result<(), CaptureError> {
        let control_result = self
            .control
            .take()
            .map_or(Ok(()), |control| control.stop().map_err(backend_error));
        let finish_result = self.callback.lock().finish();
        let result = match control_result {
            Err(error) => Err(error),
            Ok(()) => finish_result,
        };
        let result = result.and_then(|()| {
            if self.metrics.frames_received() == 0 {
                return Err(CaptureError::Backend(
                    "Windows Graphics Capture produced no frames for the selected window".into(),
                ));
            }
            let size = std::fs::metadata(&self.output)
                .map_err(backend_error)?
                .len();
            if size == 0 {
                return Err(CaptureError::Backend(
                    "Windows Graphics Capture produced an empty video file".into(),
                ));
            }
            Ok(())
        });
        if result.is_err() {
            let _ = std::fs::remove_file(&self.output);
        }
        result
    }

    pub fn is_available(&self) -> bool {
        !self.unavailable.load(Ordering::Acquire)
    }

    #[must_use]
    pub fn video_format(&self) -> Option<crate::screen::VideoFormat> {
        let (width, height) = self.callback.lock().encoded_size?;
        Some(crate::screen::VideoFormat {
            width,
            height,
            stride: width as usize * 4,
            pixel_format: crate::screen::PixelFormat::Bgra8,
        })
    }

    #[must_use]
    pub fn metrics(&self) -> Arc<ScreenCaptureMetrics> {
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

struct StartItemConfig<'a> {
    output: &'a Path,
    size: (u32, u32),
    bitrate: u32,
    fps: u32,
    exclude_cursor: bool,
    region: Option<ScreenRegion>,
    start_gate: Arc<StartGate>,
}

fn start_item<T>(item: T, config: StartItemConfig<'_>) -> Result<WindowsRecording, CaptureError>
where
    T: TryInto<GraphicsCaptureItemType> + Send + 'static,
{
    let StartItemConfig {
        output,
        size,
        bitrate,
        fps,
        exclude_cursor,
        region,
        start_gate,
    } = config;
    let metrics = Arc::new(ScreenCaptureMetrics::default());
    let unavailable = Arc::new(AtomicBool::new(false));
    let catalog_crop = region
        .map(|region| normalize_crop(region, size.0, size.1))
        .transpose()?;
    let (width, height) = catalog_crop.map_or(size, |crop| (crop.width(), crop.height()));
    let width = even_dimension(width);
    let height = even_dimension(height);
    if width == 0 || height == 0 {
        return Err(CaptureError::InvalidConfiguration(
            "screen crop is empty".into(),
        ));
    }
    let flags = HandlerFlags {
        output: output.to_owned(),
        width,
        height,
        bitrate,
        fps,
        metrics: metrics.clone(),
        start_gate,
        region,
        unavailable: unavailable.clone(),
    };
    let compatibility = compatible_settings(exclude_cursor, fps);
    let settings = Settings::new(
        item,
        compatibility.cursor,
        compatibility.border,
        compatibility.secondary_windows,
        compatibility.minimum_update_interval,
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
        output: output.to_owned(),
        unavailable,
    })
}

fn window_from_source_id(source_id: &SourceId) -> Result<Window, CaptureError> {
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

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("Windows Graphics Capture failed: {error}"))
}

#[cfg(test)]
#[path = "capture_tests.rs"]
mod tests;
