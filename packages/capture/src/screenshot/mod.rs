use crate::{
    CaptureError,
    model::{ScreenRegion, ScreenSelection},
    screen::OwnedVideoFrame,
};
use serde::{Deserialize, Serialize};
use std::{fs::File, io::BufWriter, path::PathBuf};

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod mac;
#[cfg(windows)]
mod win;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotRequest {
    pub screen: ScreenSelection,
    pub region: Option<ScreenRegion>,
    pub output: PathBuf,
    #[serde(default)]
    pub excluded_window_handles: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotResult {
    pub width: u32,
    pub height: u32,
}

pub fn capture(request: ScreenshotRequest) -> Result<ScreenshotResult, CaptureError> {
    if let Some(region) = request.region {
        region.validate()?;
        let display = match &request.screen {
            ScreenSelection::Source { source_id } => {
                source_id.as_str().starts_with("wgc:monitor:")
                    || source_id.as_str().starts_with("sck:display:")
            }
            ScreenSelection::Portal { kind, .. } => {
                matches!(kind, crate::model::PortalSourceKind::Monitor)
            }
        };
        if !display {
            return Err(CaptureError::InvalidConfiguration(
                "Screenshot regions require a display".into(),
            ));
        }
    }
    if request
        .output
        .extension()
        .is_none_or(|value| value != "png")
    {
        return Err(CaptureError::InvalidConfiguration(
            "Screenshot output must be PNG".into(),
        ));
    }
    #[cfg(target_os = "linux")]
    let frame = linux::capture(&request)?;
    #[cfg(target_os = "macos")]
    let frame = mac::capture(&request)?;
    #[cfg(windows)]
    let frame = win::capture(&request)?;
    write_png(&frame, &request.output)
}

fn write_png(
    frame: &OwnedVideoFrame,
    output: &std::path::Path,
) -> Result<ScreenshotResult, CaptureError> {
    let rgba = rgba_pixels(frame)?;
    let temporary = output.with_extension("png.tmp");
    let result = (|| {
        let file = File::create(&temporary).map_err(backend_error)?;
        let mut encoder = png::Encoder::new(BufWriter::new(file), frame.width, frame.height);
        // The source is lossless; favor capture latency over maximum compression.
        encoder.set_compression(png::Compression::Fast);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().map_err(backend_error)?;
        writer.write_image_data(&rgba).map_err(backend_error)?;
        writer.finish().map_err(backend_error)?;
        std::fs::rename(&temporary, output).map_err(backend_error)?;
        Ok(ScreenshotResult {
            width: frame.width,
            height: frame.height,
        })
    })();
    if result.is_err() {
        let _cleanup = std::fs::remove_file(temporary);
    }
    result
}

fn rgba_pixels(frame: &OwnedVideoFrame) -> Result<Vec<u8>, CaptureError> {
    let row = frame.width as usize * 4;
    let bytes = frame.stride.checked_mul(frame.height as usize);
    if frame.width == 0
        || frame.height == 0
        || frame.width > 16384
        || frame.height > 16384
        || u64::from(frame.width) * u64::from(frame.height) > 67_108_864
        || frame.stride < row
        || bytes.is_none_or(|size| size > frame.pixels.len())
    {
        return Err(CaptureError::Backend(
            "Invalid screenshot pixel buffer".into(),
        ));
    }
    let mut output = Vec::with_capacity(row * frame.height as usize);
    for scanline in frame
        .pixels
        .chunks(frame.stride)
        .take(frame.height as usize)
    {
        for pixel in scanline[..row].as_chunks::<4>().0 {
            output.extend_from_slice(&[pixel[2], pixel[1], pixel[0], 255]);
        }
    }
    Ok(output)
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(error.to_string())
}

#[cfg(test)]
mod tests;
