use windows::Win32::{
    Foundation::{HWND, RECT},
    Graphics::Dwm::{DWMWA_EXTENDED_FRAME_BOUNDS, DwmGetWindowAttribute},
    UI::WindowsAndMessaging::{
        HWND_TOP, IsWindow, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SetWindowPos,
    },
};

use crate::{
    CaptureError,
    model::SourceId,
    screen::{SelectionBounds, WindowSelectionPreview},
};

pub fn preview_window_selection(
    source: &SourceId,
    raise: bool,
) -> Result<WindowSelectionPreview, CaptureError> {
    let id = super::super::selection::parse_window_id(source, "wgc:window:", 16)?;
    let handle =
        usize::try_from(id).map_err(|_| CaptureError::SourceNotFound(source.to_string()))?;
    let hwnd = HWND(handle as *mut std::ffi::c_void);
    // SAFETY: the handle is checked before every native operation; disappearing
    // windows are handled by the Win32 result rather than retained pointers.
    if !unsafe { IsWindow(Some(hwnd)) }.as_bool() {
        return Err(CaptureError::SourceNotFound(source.to_string()));
    }
    let raise_error = if raise {
        unsafe {
            SetWindowPos(
                hwnd,
                Some(HWND_TOP),
                0,
                0,
                0,
                0,
                SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
            )
        }
        .err()
        .map(|error| format!("Could not bring the selected window forward: {error}"))
    } else {
        None
    };
    let mut rect = RECT::default();
    unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            (&raw mut rect).cast(),
            size_of::<RECT>() as u32,
        )
    }
    .map_err(|error| {
        CaptureError::Backend(format!("Could not inspect the selected window: {error}"))
    })?;
    let bounds = SelectionBounds::from_rect(
        f64::from(rect.left),
        f64::from(rect.top),
        f64::from(rect.right) - f64::from(rect.left),
        f64::from(rect.bottom) - f64::from(rect.top),
    )?;
    Ok(WindowSelectionPreview {
        bounds,
        raise_error,
    })
}
