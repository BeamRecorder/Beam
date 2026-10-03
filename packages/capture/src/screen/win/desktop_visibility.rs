use crate::CaptureError;
use windows::{
    Win32::{
        Foundation::{HWND, LPARAM},
        UI::WindowsAndMessaging::{
            EnumWindows, FindWindowExW, GetClassNameW, IsWindow, IsWindowVisible, SW_HIDE,
            SW_SHOWNA, ShowWindow,
        },
    },
    core::w,
};

pub(crate) struct DesktopVisibility {
    hidden: Vec<HWND>,
}
impl DesktopVisibility {
    pub(crate) fn hide(taskbar: bool, icons: bool) -> Result<Self, CaptureError> {
        let mut desktop = Self { hidden: Vec::new() };
        if !taskbar && !icons {
            return Ok(desktop);
        }
        let mut candidates = Vec::<HWND>::new();
        // The synchronous enumeration callback borrows this stack-owned vector.
        unsafe {
            EnumWindows(
                Some(collect_windows),
                LPARAM((&raw mut candidates).cast::<()>() as isize),
            )
        }
        .map_err(|error| {
            CaptureError::Backend(format!("Cannot enumerate desktop windows: {error}"))
        })?;
        for hwnd in candidates {
            let mut name = [0_u16; 256];
            let length = unsafe { GetClassNameW(hwnd, &mut name) };
            let name = String::from_utf16_lossy(&name[..usize::try_from(length).unwrap_or(0)]);
            if taskbar && matches!(name.as_str(), "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
                desktop.hide_window(hwnd)?;
            }
            if icons
                && let Ok(view) =
                    unsafe { FindWindowExW(Some(hwnd), None, w!("SHELLDLL_DefView"), None) }
                && let Ok(list) =
                    unsafe { FindWindowExW(Some(view), None, w!("SysListView32"), None) }
            {
                desktop.hide_window(list)?;
            }
        }
        Ok(desktop)
    }
    fn hide_window(&mut self, hwnd: HWND) -> Result<(), CaptureError> {
        if !unsafe { IsWindowVisible(hwnd) }.as_bool() {
            return Ok(());
        }
        self.hidden.push(hwnd);
        let _previous = unsafe { ShowWindow(hwnd, SW_HIDE) };
        if unsafe { IsWindowVisible(hwnd) }.as_bool() {
            return Err(CaptureError::Backend(
                "The desktop window could not be hidden".into(),
            ));
        }
        Ok(())
    }
    pub(crate) fn restore(&mut self) -> Result<(), CaptureError> {
        let mut failed = Vec::new();
        for hwnd in self.hidden.drain(..) {
            if unsafe { IsWindow(Some(hwnd)) }.as_bool() {
                let _previous = unsafe { ShowWindow(hwnd, SW_SHOWNA) };
                if !unsafe { IsWindowVisible(hwnd) }.as_bool() {
                    failed.push(hwnd);
                }
            }
        }
        self.hidden = failed;
        if self.hidden.is_empty() {
            Ok(())
        } else {
            Err(CaptureError::Backend(
                "The desktop could not be completely restored".into(),
            ))
        }
    }
}
unsafe extern "system" fn collect_windows(hwnd: HWND, param: LPARAM) -> windows::core::BOOL {
    // EnumWindows invokes this only while its caller's vector is alive.
    let candidates = unsafe { &mut *(param.0 as *mut Vec<HWND>) };
    candidates.push(hwnd);
    true.into()
}
impl Drop for DesktopVisibility {
    fn drop(&mut self) {
        if let Err(error) = self.restore() {
            use std::io::Write;
            let _ = writeln!(
                std::io::stderr().lock(),
                "Desktop restoration failed: {error}"
            );
        }
    }
}
