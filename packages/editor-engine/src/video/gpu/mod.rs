//! GStreamer's GPU composition policy, shared by playback and rendering.
pub mod camera;
mod decoder;
#[cfg(target_os = "linux")]
mod egl;
#[cfg(target_os = "linux")]
pub mod linear;
pub(super) mod meta;
mod mixer;
pub(crate) mod source;
pub(crate) mod transfer;
pub mod types;
use crate::{EditorError, Result};
use gst::prelude::*;
use gst_gl::prelude::*;
use std::sync::OnceLock;

/// GES caches its compositor at initialization. Select OpenGL before building any timeline.
/// Decoder ranks remain untouched: decodebin negotiates hardware memory when supported.
pub fn initialize() -> Result<()> {
    static INITIALIZED: OnceLock<std::result::Result<(), String>> = OnceLock::new();
    INITIALIZED
        .get_or_init(|| {
            gst::init().map_err(|e| e.to_string())?;
            let factory = gst::ElementFactory::find("glvideomixer")
                .ok_or("install GStreamer's OpenGL plugin for GPU composition")?;
            factory.set_rank(gst::Rank::PRIMARY + 100);
            #[cfg(target_os = "linux")]
            linear::register().map_err(|e| e.to_string())?;
            decoder::register().map_err(|e| e.to_string())?;
            ges::init().map_err(|e| e.to_string())
        })
        .clone()
        .map_err(EditorError::Media)
}

/// GPU scaling/color conversion precedes the bounded host transfer.
pub fn preview_sink(width: u32, height: u32) -> String {
    format!(
        "glupload ! glcolorconvert ! glcolorscale ! video/x-raw(memory:GLMemory),format=RGBA,texture-target=2D,width={width},height={height},pixel-aspect-ratio=1/1 ! gldownload name=preview_transfer ! video/x-raw,format=RGBA ! appsink name=preview"
    )
}

/// All compositions and discovery decoders share one display. Separate EGL display
/// wrappers may terminate the same native display when an old timeline is dropped.
pub fn display_context() -> &'static gst::Context {
    static CONTEXT: OnceLock<gst::Context> = OnceLock::new();
    CONTEXT.get_or_init(|| {
        let mut context = gst::Context::new("gst.gl.GLDisplay", true);
        context
            .get_mut()
            .expect("new owned context")
            .set_gl_display(&gst_gl::GLDisplay::new());
        context
    })
}
pub fn configure(pipeline: &ges::Pipeline) {
    pipeline.set_context(display_context());
    mixer::configure(pipeline);
}

/// Selects a platform memory handle, never a CPU map, for a compatible native device.
pub fn external_preview_sink(width: u32, height: u32) -> String {
    preview_sink(width, height).replace(
        "video/x-raw,format=RGBA ! appsink",
        "video/x-raw(memory:DMABuf),format=DMA_DRM,drm-format=AB24 ! appsink",
    )
}
