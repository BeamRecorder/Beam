//! Hide only Explorer's panels and desktop icon view, preserving the wallpaper.

use super::{DesktopCapabilities, DesktopOptions};
use crate::CaptureError;
use windows::{
    Win32::{
        Foundation::{HWND, LPARAM},
        UI::WindowsAndMessaging::{
            EnumChildWindows, EnumWindows, GetClassNameW, IsWindow, IsWindowVisible, SW_HIDE,
            SW_SHOWNOACTIVATE, ShowWindow,
        },
    },
    core::BOOL,
};

#[derive(Default)]
pub(super) struct Appearance {
    hidden: Vec<(isize, String)>,
}

pub(super) fn capabilities() -> Result<DesktopCapabilities, CaptureError> {
    let windows = desktop_windows()?;
    Ok(DesktopCapabilities {
        taskbar: windows.iter().any(|(_, class)| is_panel(class)),
        desktop_icons: windows.iter().any(|(_, class)| class == "SHELLDLL_DefView"),
        capture_only: false,
    })
}

impl Appearance {
    pub(super) fn apply(&mut self, options: DesktopOptions) -> Result<(), CaptureError> {
        for (handle, class) in desktop_windows()? {
            if !(options.hide_taskbar && is_panel(&class)
                || options.hide_desktop_icons && class == "SHELLDLL_DefView")
            {
                continue;
            }
            let hwnd = HWND(handle as *mut std::ffi::c_void);
            // SAFETY: OS enumeration supplied this handle; visibility is checked before mutation.
            if !unsafe { IsWindowVisible(hwnd) }.as_bool() {
                continue;
            }
            self.hidden.push((handle, class));
            unsafe {
                let _ = ShowWindow(hwnd, SW_HIDE);
            }
            if unsafe { IsWindowVisible(hwnd) }.as_bool() {
                return Err(CaptureError::Backend(
                    "Explorer refused to hide a desktop element".into(),
                ));
            }
        }
        Ok(())
    }
    pub(super) fn excluded_window_handles(&self) -> Vec<String> {
        Vec::new()
    }
    pub(super) fn restore(&mut self) -> Result<(), CaptureError> {
        self.hidden.retain(|(handle, class)| {
            let hwnd = HWND(*handle as *mut std::ffi::c_void);
            // SAFETY: check existence and identity before restoring an enumerated Explorer window.
            if !unsafe { IsWindow(Some(hwnd)) }.as_bool() || class_name(hwnd) != *class {
                return false;
            }
            unsafe {
                let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            }
            !unsafe { IsWindowVisible(hwnd) }.as_bool()
        });
        if self.hidden.is_empty() {
            Ok(())
        } else {
            Err(CaptureError::Backend(
                "could not restore Explorer desktop elements".into(),
            ))
        }
    }
}

fn is_panel(class: &str) -> bool {
    matches!(class, "Shell_TrayWnd" | "Shell_SecondaryTrayWnd")
}
fn class_name(hwnd: HWND) -> String {
    let mut buffer = [0u16; 256];
    // SAFETY: bounded writable buffer; the OS validates the input handle.
    let length = unsafe { GetClassNameW(hwnd, &mut buffer) }.max(0) as usize;
    String::from_utf16_lossy(&buffer[..length])
}

fn desktop_windows() -> Result<Vec<(isize, String)>, CaptureError> {
    let mut windows = Vec::new();
    // SAFETY: callbacks are synchronous; LPARAM points to this live vector.
    unsafe {
        EnumWindows(
            Some(top_window),
            LPARAM((&mut windows as *mut Vec<(isize, String)>) as isize),
        )
    }
    .map_err(|error| CaptureError::Backend(error.to_string()))?;
    Ok(windows)
}

unsafe extern "system" fn top_window(hwnd: HWND, data: LPARAM) -> BOOL {
    let class = class_name(hwnd);
    if is_panel(&class) {
        // SAFETY: EnumWindows only invokes this callback during desktop_windows.
        unsafe { &mut *(data.0 as *mut Vec<(isize, String)>) }
            .push((hwnd.0 as isize, class.clone()));
    }
    if matches!(class.as_str(), "Progman" | "WorkerW") {
        // SAFETY: same synchronous enumeration and live vector as the outer callback.
        unsafe {
            let _ = EnumChildWindows(Some(hwnd), Some(icon_window), data);
        }
    }
    BOOL(1)
}

unsafe extern "system" fn icon_window(hwnd: HWND, data: LPARAM) -> BOOL {
    let class = class_name(hwnd);
    if class == "SHELLDLL_DefView" {
        // SAFETY: EnumChildWindows is synchronous and receives the live parent vector.
        unsafe { &mut *(data.0 as *mut Vec<(isize, String)>) }.push((hwnd.0 as isize, class));
    }
    BOOL(1)
}
