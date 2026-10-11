use super::{
    capture_handler::{CaptureHandler, CaptureHealth, HandlerFlags},
    compatibility::compatible_settings,
};
use crate::{
    CaptureError,
    model::{ScreenRegion, SourceId},
    screen::{
        ScreenCaptureMetrics, ScreenConsumer, ScreenOpenRequest, bounded_task::NativeOperations,
    },
    session::StartGate,
};
use parking_lot::Mutex;
use std::{
    ffi::c_void,
    path::{Path, PathBuf},
    sync::{
        Arc, OnceLock,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use windows_capture::{
    capture::{CaptureControl, GraphicsCaptureApiHandler},
    monitor::Monitor,
    settings::{ColorFormat, DirtyRegionSettings, GraphicsCaptureItemType, Settings},
    window::Window,
};

type Control = CaptureControl<CaptureHandler, String>;
fn native_operations() -> &'static NativeOperations {
    static OPERATIONS: OnceLock<NativeOperations> = OnceLock::new();
    OPERATIONS.get_or_init(NativeOperations::default)
}

pub(super) fn run_native<T: Send + 'static>(
    name: &'static str,
    timeout: Duration,
    operation: impl FnOnce() -> Result<T, CaptureError> + Send + 'static,
) -> Result<T, CaptureError> {
    native_operations().run(name, timeout, move || {
        let _apartment = super::RuntimeApartment::initialize()?;
        operation()
    })
}

pub struct WindowsRecording {
    control: Option<Control>,
    callback: Arc<Mutex<CaptureHandler>>,
    metrics: Arc<ScreenCaptureMetrics>,
    output: PathBuf,
    health: Arc<Mutex<CaptureHealth>>,
    stopping: Arc<AtomicBool>,
    start_gate: Arc<StartGate>,
    stopped_result: Option<Result<(), String>>,
    stop_requested_at: Option<Instant>,
    finalized: Arc<AtomicBool>,
    health_worker: Option<std::thread::JoinHandle<Result<(), CaptureError>>>,
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
            ) && !request.show_real_cursor,
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
            return start_item(
                monitor,
                StartItemConfig {
                    output,
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
            return start_item(
                window,
                StartItemConfig {
                    output,
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

    pub(crate) fn request_stop(&mut self) {
        self.stop_requested_at.get_or_insert_with(Instant::now);
        self.stopping.store(true, Ordering::Release);
        self.start_gate.cancel();
    }

    pub fn stop(&mut self) -> Result<(), CaptureError> {
        if let Some(result) = &self.stopped_result {
            return result.clone().map_err(CaptureError::Backend);
        }
        self.request_stop();
        let stopped_at = self.stop_requested_at.unwrap_or_else(Instant::now);
        let control = self.control.take();
        let callback = self.callback.clone();
        let finalized = self.finalized.clone();
        let output = self.output.clone();
        let metrics = self.metrics.clone();
        let mut result = run_native("wgc-stop", Duration::from_secs(25), move || {
            let stopped = control.map_or(Ok(()), |control| control.stop().map_err(backend_error));
            let finished = callback.lock().finish_at(stopped_at);
            if finished.is_ok() && validate_output(&output, metrics.frames_received()).is_ok() {
                finalized.store(true, Ordering::Release);
            }
            stopped.and(finished)
        })
        .and_then(|()| {
            if let Some(error) = &self.health.lock().failure {
                return Err(CaptureError::Backend(error.clone()));
            }
            validate_output(&self.output, self.metrics.frames_received())
        });
        if let Some(worker) = self.health_worker.take() {
            let joined = crate::session::join_worker(worker, "Windows capture health");
            result = result.and(joined);
        }
        if let Err(error) = &result {
            self.health.lock().fail(error);
        }
        // Never delete media here. Even a failed or interrupted segment may
        // contain valid recorded content and must remain available to recovery.
        self.stopped_result = Some(result.as_ref().copied().map_err(ToString::to_string));
        result
    }
    pub fn is_available(&self) -> bool {
        self.failure_reason().is_none()
    }
    pub(crate) fn output_finalized(&self) -> bool {
        self.finalized.load(Ordering::Acquire)
    }
    pub fn failure_reason(&self) -> Option<String> {
        if self.stopping.load(Ordering::Acquire) {
            return self.health.lock().failure.clone();
        }
        if self.control.as_ref().is_some_and(Control::is_finished) {
            self.health
                .lock()
                .fail("Windows Graphics Capture stopped unexpectedly");
        }
        if self
            .health_worker
            .as_ref()
            .is_some_and(std::thread::JoinHandle::is_finished)
            && self.health.lock().failure.is_none()
        {
            self.health
                .lock()
                .fail("Windows capture health worker stopped unexpectedly");
        }
        let mut health = self.health.lock();
        if self.start_gate.is_released() {
            let now = Instant::now();
            if health.callback_since.is_some_and(|since| {
                now.saturating_duration_since(since) >= Duration::from_secs(15)
            }) {
                health.fail("Windows capture callback is blocked for 15 seconds");
            } else if health.encoded_size.is_none()
                && self
                    .start_gate
                    .elapsed_since_release()
                    .is_some_and(|elapsed| elapsed >= Duration::from_secs(30))
            {
                health.fail(
                    "Windows Graphics Capture did not deliver its first image within 30 seconds",
                );
            }
        }
        health.failure.clone()
    }
    #[must_use]
    pub fn video_format(&self) -> Option<crate::screen::VideoFormat> {
        let (width, height) = self.health.lock().encoded_size?;
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
        if self.control.is_some() {
            let _ = self.stop();
        }
    }
}

fn validate_output(path: &Path, frames: u64) -> Result<(), CaptureError> {
    if frames == 0 {
        return Err(CaptureError::Backend(
            "Windows Graphics Capture produced no frames for the selected source".into(),
        ));
    }
    if std::fs::metadata(path).map_err(backend_error)?.len() == 0 {
        return Err(CaptureError::Backend(
            "Windows Graphics Capture produced an empty video file".into(),
        ));
    }
    Ok(())
}

struct StartItemConfig<'a> {
    output: &'a Path,
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
        bitrate,
        fps,
        exclude_cursor,
        region,
        start_gate,
    } = config;
    let metrics = Arc::new(ScreenCaptureMetrics::default());
    let health = Arc::new(Mutex::new(CaptureHealth::default()));
    let stopping = Arc::new(AtomicBool::new(false));
    let recording_gate = start_gate.clone();
    let flags = HandlerFlags {
        output: output.to_owned(),
        bitrate,
        fps,
        metrics: metrics.clone(),
        start_gate,
        region,
        health: health.clone(),
        stopping: stopping.clone(),
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
    let output = output.to_owned();
    run_native("wgc-start", Duration::from_secs(15), move || {
        let control = CaptureHandler::start_free_threaded(settings).map_err(backend_error)?;
        let callback = control.callback();
        let mut recording = WindowsRecording {
            control: Some(control),
            callback,
            metrics,
            output,
            health,
            stopping,
            start_gate: recording_gate,
            stopped_result: None,
            stop_requested_at: None,
            finalized: Arc::new(AtomicBool::new(false)),
            health_worker: None,
        };
        match super::capture_health::start(
            recording.callback.clone(),
            recording.health.clone(),
            recording.stopping.clone(),
        ) {
            Ok(worker) => recording.health_worker = Some(worker),
            Err(error) => {
                // Still inside the bounded startup worker. Clean up here rather
                // than recursively trying to acquire its native-operation slot.
                recording.request_stop();
                if let Some(control) = recording.control.take() {
                    let _ = control.stop();
                }
                let _ = recording.callback.lock().finish_at(Instant::now());
                return Err(error);
            }
        }
        Ok(recording)
    })
}

pub(crate) fn window_from_source_id(source_id: &SourceId) -> Result<Window, CaptureError> {
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
