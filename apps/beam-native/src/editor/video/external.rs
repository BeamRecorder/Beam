//! Adapts GStreamer's native allocation to Argui's common external-frame contract.
use argui_render::{GpuCanvasError, GpuCanvasRenderContext, ImportedExternalFrame};
use beam_editor_engine::video::gpu::types::ExternalFrame;

/// Leases a completed GStreamer image. Argui owns backend import and submission lifetime.
#[cfg(target_os = "linux")]
pub(super) fn import(
    context: &mut GpuCanvasRenderContext<'_>,
    size: [u32; 2],
    frame: ExternalFrame,
) -> Result<ImportedExternalFrame, GpuCanvasError> {
    use argui_render::{
        ExternalFrame as ArguiFrame, ExternalFrameDescriptor, ExternalFrameFormat,
        ExternalFrameMemory,
    };
    let ExternalFrame::DmaBuf(buffer) = &frame;
    let memory = ExternalFrameMemory::DmaBuf {
        fd: buffer
            .descriptor()
            .map_err(|e| GpuCanvasError::new(e.to_string()))?,
        modifier: buffer.modifier,
        stride: buffer.stride,
        offset: buffer.offset,
    };
    // SAFETY: transfer::dmabuf validated RGBA/stride. GStreamer's GL export waits
    // for its producer fence. Both GL and DMA allocations remain leased by frame.
    let frame = unsafe {
        ArguiFrame::new(
            ExternalFrameDescriptor {
                size,
                format: ExternalFrameFormat::Rgba8Srgb,
            },
            memory,
            std::sync::Arc::new(frame),
        )
    }?;
    context.import_external_frame(std::sync::Arc::new(frame))
}
#[cfg(not(target_os = "linux"))]
pub(super) fn import(
    _: &mut GpuCanvasRenderContext<'_>,
    _: [u32; 2],
    frame: ExternalFrame,
) -> Result<ImportedExternalFrame, GpuCanvasError> {
    match frame {}
}
