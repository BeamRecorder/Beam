use super::ScreenshotRequest;
use crate::{CaptureError, screen::OwnedVideoFrame};

pub(super) fn capture(request: &ScreenshotRequest) -> Result<OwnedVideoFrame, CaptureError> {
    crate::screen::win::capture_screenshot(request)
}
