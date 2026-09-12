use super::{capture::window_from_source_id, compatibility::compatible_settings};
use crate::{
    CaptureError,
    model::ScreenSelection,
    screen::{OwnedVideoFrame, PixelFormat},
    screenshot::ScreenshotRequest,
};
use std::{
    sync::{Arc, mpsc},
    time::Duration,
};
use windows_capture::{
    capture::{Context, GraphicsCaptureApiHandler},
    frame::Frame,
    graphics_capture_api::InternalCaptureControl,
    monitor::Monitor,
    settings::{ColorFormat, DirtyRegionSettings, GraphicsCaptureItemType, Settings},
};

struct FirstFrame {
    sender: Option<mpsc::SyncSender<OwnedVideoFrame>>,
}
impl GraphicsCaptureApiHandler for FirstFrame {
    type Flags = mpsc::SyncSender<OwnedVideoFrame>;
    type Error = String;
    fn new(context: Context<Self::Flags>) -> Result<Self, String> {
        Ok(Self {
            sender: Some(context.flags),
        })
    }
    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        stop: InternalCaptureControl,
    ) -> Result<(), String> {
        let (width, height) = (frame.width(), frame.height());
        let pixels = frame
            .buffer()
            .map_err(|error| error.to_string())?
            .as_nopadding_buffer(&mut Vec::new())
            .to_vec();
        if let Some(sender) = self.sender.take() {
            sender
                .send(OwnedVideoFrame {
                    width,
                    height,
                    stride: width as usize * 4,
                    pixel_format: PixelFormat::Bgra8,
                    pixels: Arc::from(pixels),
                })
                .map_err(|error| error.to_string())?;
        }
        stop.stop();
        Ok(())
    }
}
fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(error.to_string())
}
fn capture_item<T: TryInto<GraphicsCaptureItemType> + Send + 'static>(
    item: T,
) -> Result<OwnedVideoFrame, CaptureError> {
    let (sender, receiver) = mpsc::sync_channel(1);
    let compatible = compatible_settings(true, 60);
    let settings = Settings::new(
        item,
        compatible.cursor,
        compatible.border,
        compatible.secondary_windows,
        compatible.minimum_update_interval,
        DirtyRegionSettings::Default,
        ColorFormat::Bgra8,
        sender,
    );
    let control = FirstFrame::start_free_threaded(settings).map_err(backend_error)?;
    match receiver.recv_timeout(Duration::from_secs(10)) {
        Ok(frame) => {
            control.wait().map_err(backend_error)?;
            Ok(frame)
        }
        Err(error) => {
            control.stop().map_err(backend_error)?;
            Err(backend_error(error))
        }
    }
}
pub(crate) fn capture_screenshot(
    request: &ScreenshotRequest,
) -> Result<OwnedVideoFrame, CaptureError> {
    let ScreenSelection::Source { source_id } = &request.screen else {
        return Err(CaptureError::InvalidConfiguration(
            "Windows screenshot requires a direct source".into(),
        ));
    };
    if let Some(device_name) = source_id.as_str().strip_prefix("wgc:monitor:") {
        let monitor = Monitor::enumerate()
            .map_err(backend_error)?
            .into_iter()
            .find(|monitor| monitor.device_name().ok().as_deref() == Some(device_name))
            .ok_or_else(|| CaptureError::SourceNotFound(source_id.to_string()))?;
        return capture_item(monitor);
    }
    capture_item(window_from_source_id(source_id)?)
}
