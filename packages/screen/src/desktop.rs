//! Foreground preview operations for the native recording-window selector.

use crate::{CaptureError, model::SourceId};
pub mod appearance;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DesktopBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Reads the live bounds of one resolved recording window.
pub fn window_bounds(id: &SourceId) -> Result<DesktopBounds, CaptureError> {
    #[cfg(target_os = "linux")]
    {
        crate::screen::linux::x11::window_bounds(id)
    }
    #[cfg(windows)]
    {
        let region = crate::cursor::win::source_region(id)?;
        Ok(DesktopBounds {
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height,
        })
    }
    #[cfg(target_os = "macos")]
    {
        let region = crate::cursor::mac::source_region(id)?;
        Ok(DesktopBounds {
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height,
        })
    }
}

/// Raises a recording target so the user can identify it under the selector.
pub fn raise_window(id: &SourceId) -> Result<(), CaptureError> {
    #[cfg(target_os = "linux")]
    {
        crate::screen::linux::x11::raise_window(id)
    }
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            HWND_TOP, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SetWindowPos,
        };
        let handle = win_handle(id)?;
        // SAFETY: the validated native handle is only used by the OS operation.
        unsafe {
            SetWindowPos(
                handle,
                Some(HWND_TOP),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            )
        }
        .map_err(|error| CaptureError::Backend(error.to_string()))
    }
    #[cfg(target_os = "macos")]
    {
        activate_window(id)
    }
}

/// Activates the chosen target before the independent countdown is presented.
pub fn activate_window(id: &SourceId) -> Result<(), CaptureError> {
    #[cfg(target_os = "linux")]
    {
        crate::screen::linux::x11::activate_window(id)
    }
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;
        let handle = win_handle(id)?;
        // SAFETY: the OS validates the selected application handle.
        if unsafe { SetForegroundWindow(handle) }.as_bool() {
            Ok(())
        } else {
            Err(CaptureError::Backend(
                "Windows denied foreground activation".into(),
            ))
        }
    }
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};
        let window = id
            .as_str()
            .strip_prefix("sck:window:")
            .and_then(|value| value.parse::<u32>().ok())
            .ok_or_else(|| {
                CaptureError::InvalidConfiguration("expected a macOS window ID".into())
            })?;
        let content = screencapturekit::shareable_content::SCShareableContent::create()
            .with_exclude_desktop_windows(true)
            .get()
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        let app = content
            .windows()
            .into_iter()
            .find(|candidate| candidate.window_id() == window)
            .and_then(|candidate| candidate.owning_application())
            .ok_or_else(|| CaptureError::SourceNotFound(id.to_string()))?;
        let running =
            NSRunningApplication::runningApplicationWithProcessIdentifier(app.process_id())
                .ok_or_else(|| CaptureError::SourceNotFound(id.to_string()))?;
        #[allow(deprecated)]
        if running.activateWithOptions(NSApplicationActivationOptions::ActivateIgnoringOtherApps) {
            Ok(())
        } else {
            Err(CaptureError::Backend(
                "macOS denied application activation".into(),
            ))
        }
    }
}

#[cfg(windows)]
fn win_handle(id: &SourceId) -> Result<windows::Win32::Foundation::HWND, CaptureError> {
    let value = id
        .as_str()
        .strip_prefix("wgc:window:")
        .and_then(|value| usize::from_str_radix(value, 16).ok())
        .filter(|value| *value != 0)
        .ok_or_else(|| CaptureError::InvalidConfiguration("expected a Windows window ID".into()))?;
    Ok(windows::Win32::Foundation::HWND(
        value as *mut std::ffi::c_void,
    ))
}

#[path = "../test/desktop.rs"]
mod checks;
