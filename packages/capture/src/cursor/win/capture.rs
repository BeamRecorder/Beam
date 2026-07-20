use std::{ffi::c_void, mem::size_of, ptr};

use windows_capture::{monitor::Monitor, window::Window};

use windows::Win32::{
    Foundation::POINT,
    Graphics::Gdi::{
        BI_RGB, BITMAP, BITMAPINFO, BITMAPINFOHEADER, CreateCompatibleDC, CreateDIBSection,
        DIB_RGB_COLORS, DeleteDC, DeleteObject, GetMonitorInfoW, GetObjectW, HGDIOBJ, HMONITOR,
        MONITORINFO, SelectObject,
    },
    UI::{
        Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_MBUTTON, VK_RBUTTON},
        WindowsAndMessaging::{
            CURSOR_SHOWING, CURSORINFO, DI_NORMAL, DrawIconEx, GetCursorInfo, GetIconInfo, HICON,
            ICONINFO,
        },
    },
};

use crate::{
    CaptureError,
    cursor::{CaptureRegion, CursorCoordinates, Hotspot, map_coordinates},
    model::SourceId,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowsCursorShape {
    pub native_id: usize,
    pub width: u32,
    pub height: u32,
    pub hotspot: Hotspot,
    pub rgba: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct WindowsCursorSample {
    pub position: CursorCoordinates,
    pub visible: bool,
    pub left_pressed: bool,
    pub right_pressed: bool,
    pub middle_pressed: bool,
    pub shape: Option<WindowsCursorShape>,
}

pub fn sample_cursor(
    region: CaptureRegion,
    include_shape: bool,
) -> Result<WindowsCursorSample, CaptureError> {
    let mut info = CURSORINFO {
        cbSize: u32::try_from(size_of::<CURSORINFO>()).map_err(backend_error)?,
        flags: Default::default(),
        hCursor: Default::default(),
        ptScreenPos: POINT::default(),
    };
    // SAFETY: `info` has the required size and remains writable for the entire call.
    unsafe { GetCursorInfo(&mut info) }.map_err(backend_error)?;
    let position = map_coordinates(info.ptScreenPos.x, info.ptScreenPos.y, region)?;
    let visible = info.flags == CURSOR_SHOWING;
    let shape = if include_shape && visible && !info.hCursor.is_invalid() {
        Some(cursor_shape(info.hCursor.0 as usize)?)
    } else {
        None
    };
    Ok(WindowsCursorSample {
        position,
        visible,
        left_pressed: key_pressed(VK_LBUTTON.0),
        right_pressed: key_pressed(VK_RBUTTON.0),
        middle_pressed: key_pressed(VK_MBUTTON.0),
        shape,
    })
}

pub fn source_region(source_id: &SourceId) -> Result<CaptureRegion, CaptureError> {
    if let Some(device_name) = source_id.as_str().strip_prefix("wgc:monitor:") {
        let monitor = Monitor::enumerate()
            .map_err(backend_error)?
            .into_iter()
            .find(|monitor| monitor.device_name().ok().as_deref() == Some(device_name))
            .ok_or_else(|| CaptureError::SourceNotFound(source_id.to_string()))?;
        let mut info = MONITORINFO {
            cbSize: u32::try_from(size_of::<MONITORINFO>()).map_err(backend_error)?,
            ..MONITORINFO::default()
        };
        // SAFETY: the monitor handle is live and `info` is correctly sized writable storage.
        if !unsafe { GetMonitorInfoW(HMONITOR(monitor.as_raw_hmonitor()), &mut info) }.as_bool() {
            return Err(CaptureError::Backend("GetMonitorInfoW failed".into()));
        }
        return region_from_rect(info.rcMonitor);
    }
    if source_id.as_str().starts_with("wgc:window:") {
        let window = Window::enumerate()
            .map_err(backend_error)?
            .into_iter()
            .find(|window| {
                source_id.as_str() == format!("wgc:window:{:x}", window.as_raw_hwnd() as usize)
            })
            .ok_or_else(|| CaptureError::SourceNotFound(source_id.to_string()))?;
        return region_from_rect(window.rect().map_err(backend_error)?);
    }
    Err(CaptureError::InvalidConfiguration(format!(
        "{source_id} is not a Windows visual source"
    )))
}

fn region_from_rect(rect: windows::Win32::Foundation::RECT) -> Result<CaptureRegion, CaptureError> {
    Ok(CaptureRegion {
        x: rect.left,
        y: rect.top,
        width: u32::try_from(rect.right.saturating_sub(rect.left).max(1)).map_err(backend_error)?,
        height: u32::try_from(rect.bottom.saturating_sub(rect.top).max(1))
            .map_err(backend_error)?,
    })
}

fn key_pressed(key: u16) -> bool {
    // SAFETY: the API accepts any virtual-key integer and dereferences no caller pointer.
    (unsafe { GetAsyncKeyState(i32::from(key)) }) < 0
}

fn cursor_shape(native_id: usize) -> Result<WindowsCursorShape, CaptureError> {
    let icon = HICON(native_id as *mut c_void);
    let mut info = ICONINFO::default();
    // SAFETY: the icon came from GetCursorInfo and `info` is valid writable storage.
    unsafe { GetIconInfo(icon, &mut info) }.map_err(backend_error)?;
    let result = render_icon(icon, &info);
    // SAFETY: GetIconInfo transfers ownership of both returned bitmap handles.
    unsafe {
        if !info.hbmColor.is_invalid() {
            let _deleted = DeleteObject(HGDIOBJ(info.hbmColor.0));
        }
        if !info.hbmMask.is_invalid() {
            let _deleted = DeleteObject(HGDIOBJ(info.hbmMask.0));
        }
    }
    let (width, height, rgba) = result?;
    Ok(WindowsCursorShape {
        native_id,
        width,
        height,
        hotspot: Hotspot {
            x: info.xHotspot,
            y: info.yHotspot,
        },
        rgba,
    })
}

fn render_icon(icon: HICON, info: &ICONINFO) -> Result<(u32, u32, Vec<u8>), CaptureError> {
    let (width, height) = bitmap_dimensions(info)?;
    let width_i32 = i32::try_from(width).map_err(backend_error)?;
    let height_i32 = i32::try_from(height).map_err(backend_error)?;
    let bitmap_info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: u32::try_from(size_of::<BITMAPINFOHEADER>()).map_err(backend_error)?,
            biWidth: width_i32,
            biHeight: -height_i32,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..BITMAPINFOHEADER::default()
        },
        ..BITMAPINFO::default()
    };
    let mut pixels = ptr::null_mut();
    // SAFETY: a null source creates a memory DC and the returned handle is released below.
    let dc = unsafe { CreateCompatibleDC(None) };
    if dc.is_invalid() {
        return Err(CaptureError::Backend("CreateCompatibleDC failed".into()));
    }
    // SAFETY: bitmap_info is initialized and pixels points to writable output storage.
    let bitmap_result =
        unsafe { CreateDIBSection(Some(dc), &bitmap_info, DIB_RGB_COLORS, &mut pixels, None, 0) };
    let bitmap = match bitmap_result {
        Ok(bitmap) => bitmap,
        Err(error) => {
            // SAFETY: dc is a live memory DC owned by this function.
            let _deleted_dc = unsafe { DeleteDC(dc) };
            return Err(backend_error(error));
        }
    };
    // SAFETY: both values are live GDI handles and the original is restored below.
    let old = unsafe { SelectObject(dc, HGDIOBJ(bitmap.0)) };
    // SAFETY: the selected DIB matches the supplied dimensions and icon is a live handle.
    let draw = unsafe { DrawIconEx(dc, 0, 0, icon, width_i32, height_i32, 0, None, DI_NORMAL) };
    let byte_len = usize::try_from(width)
        .unwrap_or(usize::MAX)
        .saturating_mul(usize::try_from(height).unwrap_or(usize::MAX))
        .saturating_mul(4);
    let mut rgba = if draw.is_ok() && !pixels.is_null() {
        // SAFETY: the DIB owns width*height*4 bytes until its handle is deleted.
        unsafe { std::slice::from_raw_parts(pixels.cast::<u8>(), byte_len) }.to_vec()
    } else {
        Vec::new()
    };
    // SAFETY: restore the old object before releasing the owned bitmap and DC.
    unsafe {
        SelectObject(dc, old);
        let _deleted = DeleteObject(HGDIOBJ(bitmap.0));
        let _deleted_dc = DeleteDC(dc);
    }
    draw.map_err(backend_error)?;
    bgra_to_rgba(&mut rgba);
    Ok((width, height, rgba))
}

fn bitmap_dimensions(info: &ICONINFO) -> Result<(u32, u32), CaptureError> {
    let handle = if !info.hbmColor.is_invalid() {
        info.hbmColor
    } else {
        info.hbmMask
    };
    let mut bitmap = BITMAP::default();
    // SAFETY: handle came from GetIconInfo and bitmap is a correctly sized output value.
    let copied = unsafe {
        GetObjectW(
            HGDIOBJ(handle.0),
            i32::try_from(size_of::<BITMAP>()).map_err(backend_error)?,
            Some((&mut bitmap as *mut BITMAP).cast()),
        )
    };
    if copied == 0 {
        return Err(CaptureError::Backend(
            "GetObjectW failed for cursor bitmap".into(),
        ));
    }
    let width = u32::try_from(bitmap.bmWidth.max(1)).map_err(backend_error)?;
    let raw_height = u32::try_from(bitmap.bmHeight.max(1)).map_err(backend_error)?;
    let height = if info.hbmColor.is_invalid() {
        (raw_height / 2).max(1)
    } else {
        raw_height
    };
    Ok((width, height))
}

fn bgra_to_rgba(pixels: &mut [u8]) {
    for pixel in pixels.chunks_exact_mut(4) {
        pixel.swap(0, 2);
        if pixel[3] == 0 && pixel[..3].iter().any(|channel| *channel != 0) {
            pixel[3] = 255;
        }
    }
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("Windows cursor capture failed: {error}"))
}
