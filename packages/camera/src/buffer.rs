use crate::CameraError;

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(crate) fn checked_packed_bgra_len(
    width: usize,
    height: usize,
    stride: usize,
    max_bytes: usize,
    available_bytes: usize,
) -> Result<usize, CameraError> {
    let minimum = width
        .checked_mul(4)
        .ok_or_else(|| CameraError::UnsupportedFormat("camera width overflow".into()))?;
    let length = height
        .checked_mul(stride)
        .ok_or_else(|| CameraError::UnsupportedFormat("camera frame size overflow".into()))?;
    if width == 0
        || height == 0
        || stride < minimum
        || length > max_bytes
        || length > available_bytes
    {
        return Err(CameraError::UnsupportedFormat(format!(
            "camera frame {width}x{height} stride {stride} exceeds permitted {max_bytes} or backing {available_bytes} bytes"
        )));
    }
    Ok(length)
}

#[path = "../test/buffer.rs"]
mod buffer_checks;
