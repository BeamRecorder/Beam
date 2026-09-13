use windows::Win32::UI::HiDpi::{
    DPI_AWARENESS_CONTEXT, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, SetThreadDpiAwarenessContext,
};

use crate::CaptureError;

// The context handle is not Send: restoration must happen on the same thread.
// Scope this to coordinate queries instead of changing the host process's DPI mode.
pub(super) struct PhysicalCoordinates {
    previous: DPI_AWARENESS_CONTEXT,
}

impl PhysicalCoordinates {
    pub(super) fn enter() -> Result<Self, CaptureError> {
        // SAFETY: PMv2 is supported by the Windows versions required for WGC.
        let previous =
            unsafe { SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) };
        if previous.0.is_null() {
            return Err(CaptureError::Backend(format!(
                "Windows cursor capture could not select physical coordinates: {}",
                windows::core::Error::from_thread(),
            )));
        }
        Ok(Self { previous })
    }
}

impl Drop for PhysicalCoordinates {
    fn drop(&mut self) {
        // SAFETY: this is the valid context returned when entering on this thread.
        unsafe { SetThreadDpiAwarenessContext(self.previous) };
    }
}

#[cfg(test)]
#[path = "dpi_tests.rs"]
mod tests;
