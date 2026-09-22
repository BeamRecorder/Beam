use std::{ptr, sync::Arc};

use windows::Win32::Media::MediaFoundation::IMFSample;

use crate::{CameraError, CameraFormat, PixelFormat};

pub(super) fn copy_sample(sample: &IMFSample, max_bytes: usize) -> Result<Arc<[u8]>, CameraError> {
    let total_length = unsafe { sample.GetTotalLength() }
        .map_err(|error| CameraError::Backend(format!("camera sample length: {error}")))?;
    if total_length == 0 || total_length as usize > max_bytes {
        return Err(CameraError::UnsupportedFormat(format!(
            "camera sample has {total_length} bytes; permitted maximum is {max_bytes}"
        )));
    }
    let buffer = unsafe { sample.ConvertToContiguousBuffer() }
        .map_err(|error| CameraError::Backend(format!("camera sample buffer: {error}")))?;
    let current_length = unsafe { buffer.GetCurrentLength() }
        .map_err(|error| CameraError::Backend(format!("camera sample length: {error}")))?;
    if current_length == 0 || current_length as usize > max_bytes {
        return Err(CameraError::UnsupportedFormat(format!(
            "camera sample has {current_length} bytes; permitted maximum is {max_bytes}"
        )));
    }
    let mut pointer = ptr::null_mut();
    let mut length = 0_u32;
    unsafe { buffer.Lock(&mut pointer, None, Some(&mut length)) }
        .map_err(|error| CameraError::Backend(format!("locking camera sample: {error}")))?;
    let valid = !pointer.is_null() && length > 0 && length as usize <= max_bytes;
    let data = if valid {
        Arc::from(unsafe { std::slice::from_raw_parts(pointer, length as usize) })
    } else {
        Arc::from([])
    };
    unsafe { buffer.Unlock() }
        .map_err(|error| CameraError::Backend(format!("unlocking camera sample: {error}")))?;
    if valid {
        Ok(data)
    } else {
        Err(CameraError::Backend(
            "invalid Media Foundation camera sample buffer".into(),
        ))
    }
}

pub(super) fn format_with_buffer_stride(mut format: CameraFormat, bytes: usize) -> CameraFormat {
    let height = format.height as usize;
    if height == 0 {
        return format;
    }
    let candidate = match format.pixel_format {
        PixelFormat::Yuyv if bytes.is_multiple_of(height) => bytes / height,
        PixelFormat::Nv12 if format.height.is_multiple_of(2) => bytes
            .checked_mul(2)
            .and_then(|total| total.checked_div(height * 3))
            .unwrap_or(0),
        _ => return format,
    };
    if let Ok(stride) = u32::try_from(candidate)
        && stride >= format.stride
        && stride <= format.width.saturating_mul(4)
    {
        format.stride = stride;
    }
    format
}

#[path = "../../test/windows/sample.rs"]
mod sample_checks;
