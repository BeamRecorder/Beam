//! Reviewed EGL boundary: export one GL plane through GStreamer's native helpers.
use crate::{Result, video::pipeline::media};
use gst::glib::translate::*;
use gst_gl::prelude::*;
use std::os::fd::{FromRawFd, OwnedFd};

unsafe extern "C" {
    fn gst_egl_image_from_texture(
        context: *mut gst_gl::ffi::GstGLContext,
        memory: *mut gst_gl::ffi::GstGLMemory,
        attributes: *const usize,
    ) -> *mut gst::ffi::GstMiniObject;
    fn gst_egl_image_export_dmabuf(
        image: *mut gst::ffi::GstMiniObject,
        fd: *mut i32,
        stride: *mut i32,
        offset: *mut usize,
    ) -> i32;
}

/// Exports an initialized GL plane on its owner thread. No video bytes are mapped.
///
/// GStreamer's export helper rejects non-linear and multi-plane EGL images.
pub(crate) fn plane(
    context: &gst_gl::GLContext,
    memory: &gst::MemoryRef,
) -> Result<(OwnedFd, i32, usize, usize)> {
    let gl = memory
        .downcast_memory_ref::<gst_gl::GLMemory>()
        .ok_or_else(|| media("encoder input is not GL memory"))?;
    if context.gl_platform() != gst_gl::GLPlatform::EGL
        || gl.texture_target() != gst_gl::GLTextureTarget::_2d
    {
        return Err(media("GPU encoder transfer requires EGL 2D textures"));
    }
    // SAFETY: called on the GL owner thread with a live, type-checked GLMemory.
    // A new EGLImage owns one reference, unreferenced on every exit below.
    let image = unsafe {
        gst_egl_image_from_texture(
            context.to_glib_none().0,
            memory.as_mut_ptr().cast(),
            std::ptr::null(),
        )
    };
    if image.is_null() {
        return Err(media("unable to share GL encoder plane"));
    }
    let (mut fd, mut stride, mut offset) = (-1, 0, 0);
    // SAFETY: all out pointers are initialized locals; image remains live.
    let success =
        unsafe { gst_egl_image_export_dmabuf(image, &mut fd, &mut stride, &mut offset) != 0 };
    unsafe { gst::ffi::gst_mini_object_unref(image) };
    if !success || fd < 0 {
        return Err(media("GPU driver cannot export a linear encoder plane"));
    }
    // SAFETY: successful export transfers this new, uniquely owned FD to us.
    let fd = unsafe { OwnedFd::from_raw_fd(fd) };
    let height = usize::try_from(gl.texture_height()).map_err(media)?;
    let size = usize::try_from(stride)
        .map_err(media)?
        .checked_mul(height)
        .and_then(|size| size.checked_add(offset))
        .ok_or_else(|| media("invalid GPU plane extent"))?;
    if stride <= 0 || size == 0 {
        return Err(media("invalid GPU plane stride"));
    }
    Ok((fd, stride, offset, size))
}

/// Retrieves the owning context from type-checked GLMemory; the returned object is retained.
pub(crate) fn context(memory: &gst::MemoryRef) -> Result<gst_gl::GLContext> {
    memory
        .downcast_memory_ref::<gst_gl::GLMemory>()
        .ok_or_else(|| media("encoder input is not GL memory"))?;
    // SAFETY: checked concrete memory type has a live owner retained by the memory.
    let context = unsafe {
        (*(memory.as_mut_ptr().cast::<gst_gl::ffi::GstGLMemory>()))
            .mem
            .context
    };
    if context.is_null() {
        return Err(media("GPU plane has no context"));
    }
    Ok(unsafe { from_glib_none(context) })
}
