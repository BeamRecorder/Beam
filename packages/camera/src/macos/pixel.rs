use objc2_core_media::{CMSampleBuffer, CMTime, CMTimeFlags};
use objc2_core_video::{
    CVPixelBuffer, CVPixelBufferGetBaseAddress, CVPixelBufferGetBytesPerRow,
    CVPixelBufferGetDataSize, CVPixelBufferGetHeight, CVPixelBufferGetPixelFormatType,
    CVPixelBufferGetWidth, CVPixelBufferIsPlanar, CVPixelBufferLockBaseAddress,
    CVPixelBufferLockFlags, CVPixelBufferUnlockBaseAddress, kCVPixelFormatType_32BGRA,
    kCVReturnSuccess,
};

use crate::{CameraError, CameraFormat, buffer::checked_packed_bgra_len};

use super::types::OwnedSample;

struct LockedPixelBuffer<'a> {
    pixel: &'a CVPixelBuffer,
    active: bool,
}

impl LockedPixelBuffer<'_> {
    fn unlock(mut self) -> Result<(), CameraError> {
        let status =
            unsafe { CVPixelBufferUnlockBaseAddress(self.pixel, CVPixelBufferLockFlags::ReadOnly) };
        self.active = false;
        if status == kCVReturnSuccess {
            Ok(())
        } else {
            Err(CameraError::Backend(format!(
                "unlocking AVFoundation pixel buffer: {status}"
            )))
        }
    }
}

impl Drop for LockedPixelBuffer<'_> {
    fn drop(&mut self) {
        if self.active {
            let _ = unsafe {
                CVPixelBufferUnlockBaseAddress(self.pixel, CVPixelBufferLockFlags::ReadOnly)
            };
        }
    }
}

pub(super) fn copy_sample(
    sample: &CMSampleBuffer,
    selected: CameraFormat,
    max_bytes: usize,
) -> Result<OwnedSample, CameraError> {
    let pixel = unsafe { sample.image_buffer() }
        .ok_or_else(|| CameraError::Backend("camera sample has no pixel buffer".into()))?;
    if CVPixelBufferGetPixelFormatType(&pixel) != kCVPixelFormatType_32BGRA
        || CVPixelBufferIsPlanar(&pixel)
    {
        return Err(CameraError::UnsupportedFormat(
            "AVFoundation did not deliver packed BGRA".into(),
        ));
    }
    let width = CVPixelBufferGetWidth(&pixel);
    let height = CVPixelBufferGetHeight(&pixel);
    let stride = CVPixelBufferGetBytesPerRow(&pixel);
    let available_bytes = CVPixelBufferGetDataSize(&pixel);
    let length = checked_packed_bgra_len(width, height, stride, max_bytes, available_bytes)?;
    if width != selected.width as usize || height != selected.height as usize {
        return Err(CameraError::UnsupportedFormat(
            "AVFoundation camera changed dimensions during capture".into(),
        ));
    }
    let status = unsafe { CVPixelBufferLockBaseAddress(&pixel, CVPixelBufferLockFlags::ReadOnly) };
    if status != kCVReturnSuccess {
        return Err(CameraError::Backend(format!(
            "locking AVFoundation pixel buffer: {status}"
        )));
    }
    let lock = LockedPixelBuffer {
        pixel: &pixel,
        active: true,
    };
    let pointer = CVPixelBufferGetBaseAddress(&pixel);
    if pointer.is_null() {
        return Err(CameraError::Backend(
            "AVFoundation pixel buffer has no base address".into(),
        ));
    }
    let bytes = unsafe { std::slice::from_raw_parts(pointer.cast::<u8>(), length) }.to_vec();
    lock.unlock()?;
    let mut format = selected;
    format.stride = u32::try_from(stride)
        .map_err(|_| CameraError::UnsupportedFormat("camera stride exceeds u32".into()))?;
    let native_timestamp_ns = time_to_ns(unsafe { sample.presentation_time_stamp() });
    Ok(OwnedSample {
        format,
        native_timestamp_ns,
        sequence: 0,
        bytes,
    })
}

fn time_to_ns(time: CMTime) -> Option<u64> {
    if !time.flags.contains(CMTimeFlags::Valid)
        || time.flags.intersects(CMTimeFlags::ImpliedValueFlagsMask)
        || time.epoch != 0
    {
        return None;
    }
    let value = u64::try_from(time.value).ok()?;
    let timescale = u64::try_from(time.timescale).ok()?;
    if timescale == 0 {
        return None;
    }
    value.checked_mul(1_000_000_000)?.checked_div(timescale)
}

#[path = "../../test/macos/pixel.rs"]
mod pixel_checks;
