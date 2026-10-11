use std::{ffi::c_void, mem::size_of, ptr};

use windows::Win32::{
    Graphics::Gdi::{
        BI_RGB, BITMAP, BITMAPINFO, BITMAPINFOHEADER, CreateCompatibleDC, CreateDIBSection,
        DIB_RGB_COLORS, DeleteDC, DeleteObject, GdiFlush, GetObjectW, HDC, HGDIOBJ, SelectObject,
    },
    UI::WindowsAndMessaging::{DI_NORMAL, DrawIconEx, HICON, ICONINFO},
};

use crate::{
    CaptureError,
    cursor::{
        CursorKind, Hotspot,
        bitmap::opacity_bitmap,
        resize_classifier::{MAX_SIDE, resize_cursor_kind},
    },
};

pub(super) fn resize_kind(
    icon: HICON,
    info: &ICONINFO,
    hotspot: Hotspot,
) -> Result<Option<CursorKind>, CaptureError> {
    let (width, height) = bitmap_dimensions(info)?;
    if !(1..=MAX_SIDE).contains(&width) || !(1..=MAX_SIDE).contains(&height) {
        return Ok(None);
    }
    let pixels = render_silhouette(icon, width, height)?;
    Ok(resize_cursor_kind(&pixels, width, height, hotspot))
}

fn render_silhouette(icon: HICON, width: u32, height: u32) -> Result<Vec<u8>, CaptureError> {
    let bitmap_info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width as i32,
            biHeight: -(height as i32),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..BITMAPINFOHEADER::default()
        },
        ..BITMAPINFO::default()
    };
    let mut pixels = ptr::null_mut();
    // SAFETY: the memory DC is owned here and released on every exit path.
    let dc = unsafe { CreateCompatibleDC(None) };
    if dc.is_invalid() {
        return Err(backend_error("CreateCompatibleDC failed"));
    }
    // SAFETY: bitmap_info describes the bounded top-down RGBA-sized allocation.
    let bitmap = match unsafe {
        CreateDIBSection(Some(dc), &bitmap_info, DIB_RGB_COLORS, &mut pixels, None, 0)
    } {
        Ok(bitmap) => bitmap,
        Err(error) => {
            let _deleted = unsafe { DeleteDC(dc) };
            return Err(backend_error(error));
        }
    };
    // SAFETY: both handles are live; restore the original object before deletion.
    let old = unsafe { SelectObject(dc, HGDIOBJ(bitmap.0)) };
    let result = if old.is_invalid() {
        Err(backend_error("SelectObject failed for cursor bitmap"))
    } else {
        draw_silhouette(dc, icon, width, height, pixels)
    };
    // SAFETY: these handles are owned by this function, including on draw failure.
    unsafe {
        if !old.is_invalid() {
            SelectObject(dc, old);
        }
        let _deleted = DeleteObject(HGDIOBJ(bitmap.0));
        let _deleted_dc = DeleteDC(dc);
    }
    result
}

fn draw_silhouette(
    dc: HDC,
    icon: HICON,
    width: u32,
    height: u32,
    pixels: *mut c_void,
) -> Result<Vec<u8>, CaptureError> {
    if pixels.is_null() {
        return Err(backend_error("CreateDIBSection returned no pixel buffer"));
    }
    // SAFETY: the live, selected DIB owns exactly width*height*4 writable bytes.
    let surface = unsafe {
        std::slice::from_raw_parts_mut(pixels.cast::<u8>(), (width * height * 4) as usize)
    };
    surface.fill(0);
    draw(dc, icon, width, height)?;
    let dark = surface.to_vec();
    surface.fill(255);
    draw(dc, icon, width, height)?;
    // Black/white compositing recovers opacity even for legacy monochrome
    // cursors, whose GDI output does not carry a usable alpha channel.
    Ok(opacity_bitmap(&dark, surface))
}

fn draw(dc: HDC, icon: HICON, width: u32, height: u32) -> Result<(), CaptureError> {
    // SAFETY: dc contains our initialized, bounded DIB and icon is borrowed/live.
    unsafe {
        DrawIconEx(
            dc,
            0,
            0,
            icon,
            width as i32,
            height as i32,
            0,
            None,
            DI_NORMAL,
        )
    }
    .map_err(backend_error)?;
    // GDI must finish writing before Rust reads the DIB memory.
    if !unsafe { GdiFlush() }.as_bool() {
        return Err(backend_error("GdiFlush failed"));
    }
    Ok(())
}

fn bitmap_dimensions(info: &ICONINFO) -> Result<(u32, u32), CaptureError> {
    let handle = if !info.hbmColor.is_invalid() {
        info.hbmColor
    } else {
        info.hbmMask
    };
    let mut bitmap = BITMAP::default();
    // SAFETY: GetIconInfo owns handle and bitmap is correctly sized output storage.
    let copied = unsafe {
        GetObjectW(
            HGDIOBJ(handle.0),
            size_of::<BITMAP>() as i32,
            Some((&mut bitmap as *mut BITMAP).cast()),
        )
    };
    if copied == 0 {
        return Err(backend_error("GetObjectW failed for cursor bitmap"));
    }
    let width = u32::try_from(bitmap.bmWidth).map_err(backend_error)?;
    let raw_height = u32::try_from(bitmap.bmHeight).map_err(backend_error)?;
    let height = if info.hbmColor.is_invalid() {
        raw_height / 2
    } else {
        raw_height
    };
    Ok((width, height))
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("Windows cursor bitmap capture failed: {error}"))
}
