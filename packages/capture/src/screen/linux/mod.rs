mod capabilities;
mod cursor_buttons;
mod cursor_fusion;
mod diagnostics;
mod ffmpeg;
mod ffmpeg_cache;
mod ffmpeg_encoder;
mod ffmpeg_process;
#[cfg(test)]
mod ffmpeg_process_tests;
mod ffmpeg_sink;
mod gpu_inventory;
pub(crate) mod hyprland;
mod input_helper_diagnostics;
#[cfg(test)]
mod input_helper_diagnostics_tests;
mod input_helper_executable;
#[cfg(test)]
mod input_helper_executable_tests;
mod input_monitor;
#[cfg(test)]
mod input_monitor_tests;
mod input_stream_health;
mod input_timeline;
mod owned_child;
mod pipe_writer;
mod pipewire;
mod portal;
mod recording;
mod region_selection;
mod runtime;
mod screen_sink;
mod timestamped_video;
pub(crate) mod x11;

pub use capabilities::*;
pub(crate) use diagnostics::*;
pub(crate) use ffmpeg::*;
pub(crate) use ffmpeg_encoder::*;
pub(crate) use ffmpeg_sink::*;
pub(crate) use input_monitor::{LinuxInputMonitor, input_helper_supported};
pub use input_monitor::{
    linux_input_access_status, request_linux_input_access, shutdown_linux_input_access,
};
pub(crate) use owned_child::terminate_all as terminate_owned_descendants;
pub use recording::*;
pub(crate) use region_selection::LinuxRegionSelection;
pub use region_selection::PortalDisplayGeometry;

/// Resolve a direct X11 source in physical root-window pixels.
pub fn x11_source_bounds(
    source: &crate::model::SourceId,
) -> Result<crate::screen::SelectionBounds, crate::CaptureError> {
    x11::source_bounds(source)
}

/// Capture a bounded thumbnail from the same direct X11 source as recording.
pub(crate) fn x11_source_preview(
    source: &crate::model::SourceId,
    max_width: u32,
    max_height: u32,
) -> Result<crate::screen::SourcePreview, crate::CaptureError> {
    let mut reader = x11::Reader::open(source, None, false)?;
    let frame = reader.read(false, false)?.0;
    let (width, height) =
        super::preview::fit_preview_dimensions(frame.width, frame.height, max_width, max_height);
    let mut rgba = Vec::with_capacity(width as usize * height as usize * 4);
    for y in 0..height {
        for x in 0..width {
            let source_x = u64::from(x) * u64::from(frame.width) / u64::from(width);
            let source_y = u64::from(y) * u64::from(frame.height) / u64::from(height);
            let offset = source_y as usize * frame.stride + source_x as usize * 4;
            rgba.extend_from_slice(&[
                frame.pixels[offset + 2],
                frame.pixels[offset + 1],
                frame.pixels[offset],
                255,
            ]);
        }
    }
    Ok(crate::screen::SourcePreview {
        source_id: source.clone(),
        thumbnail: super::preview::jpeg_data_url(&rgba, width, height)?,
    })
}
