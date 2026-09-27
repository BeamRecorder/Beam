use crate::{CameraError, CameraFormat, PixelFormat};

pub(crate) fn convert_to_rgba(
    format: CameraFormat,
    bytes: &[u8],
    output: &mut Vec<u8>,
) -> Result<(), CameraError> {
    let width = usize::try_from(format.width).map_err(|_| invalid("width overflow"))?;
    let height = usize::try_from(format.height).map_err(|_| invalid("height overflow"))?;
    let stride = usize::try_from(format.stride).map_err(|_| invalid("stride overflow"))?;
    let length = width
        .checked_mul(height)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| invalid("RGBA dimensions overflow"))?;
    if width == 0 || height == 0 {
        return Err(invalid("zero frame dimensions"));
    }
    output.resize(length, 0);
    let rgba = output.as_mut_slice();
    match format.pixel_format {
        PixelFormat::Bgra => {
            check_rows(bytes, stride, width * 4, height)?;
            for (src, dst) in bytes
                .chunks(stride)
                .take(height)
                .zip(rgba.chunks_exact_mut(width * 4))
            {
                for (pixel, output) in src[..width * 4]
                    .as_chunks::<4>()
                    .0
                    .iter()
                    .zip(dst.as_chunks_mut::<4>().0.iter_mut())
                {
                    output.copy_from_slice(&[pixel[2], pixel[1], pixel[0], pixel[3]]);
                }
            }
        }
        PixelFormat::Yuyv => {
            if width % 2 != 0 {
                return Err(invalid("YUYV width must be even"));
            }
            check_rows(bytes, stride, width * 2, height)?;
            for (src, dst) in bytes
                .chunks(stride)
                .take(height)
                .zip(rgba.chunks_exact_mut(width * 4))
            {
                for (pair, output) in src[..width * 2]
                    .as_chunks::<4>()
                    .0
                    .iter()
                    .zip(dst.as_chunks_mut::<8>().0.iter_mut())
                {
                    output[..4].copy_from_slice(&yuv_to_rgba(pair[0], pair[1], pair[3]));
                    output[4..].copy_from_slice(&yuv_to_rgba(pair[2], pair[1], pair[3]));
                }
            }
        }
        PixelFormat::Nv12 => {
            if width % 2 != 0 || height % 2 != 0 {
                return Err(invalid("NV12 dimensions must be even"));
            }
            check_rows(bytes, stride, width, height + height / 2)?;
            let uv_start = stride * height;
            for y in 0..height {
                for x in 0..width {
                    let luma = bytes[y * stride + x];
                    let uv = uv_start + (y / 2) * stride + (x / 2) * 2;
                    let rgba_pixel = yuv_to_rgba(luma, bytes[uv], bytes[uv + 1]);
                    rgba[(y * width + x) * 4..(y * width + x + 1) * 4].copy_from_slice(&rgba_pixel);
                }
            }
        }
        PixelFormat::Mjpeg => {
            convert_mjpeg(bytes, format, rgba)?;
        }
    }
    Ok(())
}

fn convert_mjpeg(bytes: &[u8], format: CameraFormat, rgba: &mut [u8]) -> Result<(), CameraError> {
    let mut decoder = jpeg_decoder::Decoder::new(bytes);
    decoder.set_max_decoding_buffer_size(rgba.len());
    let pixels = decoder
        .decode()
        .map_err(|error| invalid(&format!("MJPEG decode failed: {error}")))?;
    let info = decoder
        .info()
        .ok_or_else(|| invalid("MJPEG image has no dimensions"))?;
    if u32::from(info.width) != format.width || u32::from(info.height) != format.height {
        return Err(invalid("MJPEG dimensions differ from the camera format"));
    }
    match info.pixel_format {
        jpeg_decoder::PixelFormat::RGB24 if pixels.len() == rgba.len() / 4 * 3 => {
            for (rgb, output) in pixels
                .as_chunks::<3>()
                .0
                .iter()
                .zip(rgba.as_chunks_mut::<4>().0.iter_mut())
            {
                output.copy_from_slice(&[rgb[0], rgb[1], rgb[2], 255]);
            }
        }
        jpeg_decoder::PixelFormat::L8 if pixels.len() == rgba.len() / 4 => {
            for (gray, output) in pixels.iter().zip(rgba.as_chunks_mut::<4>().0.iter_mut()) {
                output.copy_from_slice(&[*gray, *gray, *gray, 255]);
            }
        }
        _ => {
            return Err(CameraError::UnsupportedFormat(
                "MJPEG pixel format is unsupported".into(),
            ));
        }
    }
    Ok(())
}

fn check_rows(
    bytes: &[u8],
    stride: usize,
    width_bytes: usize,
    rows: usize,
) -> Result<(), CameraError> {
    if stride < width_bytes {
        return Err(invalid("camera stride is smaller than its active row"));
    }
    let minimum = stride
        .checked_mul(rows.saturating_sub(1))
        .and_then(|prefix| prefix.checked_add(width_bytes))
        .ok_or_else(|| invalid("camera buffer size overflow"))?;
    if bytes.len() < minimum {
        return Err(invalid("camera buffer is shorter than its declared rows"));
    }
    Ok(())
}

fn yuv_to_rgba(y: u8, u: u8, v: u8) -> [u8; 4] {
    let y = i32::from(y).saturating_sub(16);
    let u = i32::from(u) - 128;
    let v = i32::from(v) - 128;
    let r = (298 * y + 409 * v + 128) >> 8;
    let g = (298 * y - 100 * u - 208 * v + 128) >> 8;
    let b = (298 * y + 516 * u + 128) >> 8;
    [clamp(r), clamp(g), clamp(b), 255]
}

fn clamp(value: i32) -> u8 {
    value.clamp(0, 255) as u8
}

fn invalid(message: &str) -> CameraError {
    CameraError::InvalidBuffer(message.into())
}
