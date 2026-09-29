//! Parse a shared GPU frame without mapping video memory on the CPU.
#[cfg(target_os = "linux")]
pub fn dmabuf(
    sample: &gst::Sample,
    producer: gst::Buffer,
) -> crate::Result<super::types::ExternalFrame> {
    use crate::video::pipeline::media;
    let caps = sample
        .caps()
        .ok_or_else(|| media("GPU preview has no caps"))?;
    let info = gst_video::VideoInfoDmaDrm::from_caps(caps).map_err(media)?;
    let buffer = sample
        .buffer()
        .ok_or_else(|| media("GPU preview has no buffer"))?;
    let expected =
        gst_video::dma_drm_fourcc_from_format(gst_video::VideoFormat::Rgba).map_err(media)?;
    if info.fourcc() != expected || buffer.n_memory() != 1 {
        return Err(media("GPU preview requires single-plane RGBA DMA-BUF"));
    }
    if buffer
        .peek_memory(0)
        .downcast_memory_ref::<gst_allocators::DmaBufMemory>()
        .is_none()
    {
        return Err(media("GStreamer did not produce DMA-BUF memory"));
    }
    let meta = buffer.meta::<gst_video::VideoMeta>();
    let stride = meta
        .as_ref()
        .map_or(info.stride()[0], |meta| meta.stride()[0]);
    let offset = meta
        .as_ref()
        .map_or(info.offset()[0], |meta| meta.offset()[0]);
    if stride < (info.width() * 4) as i32 {
        return Err(media("invalid DMA-BUF row layout"));
    }
    Ok(super::types::ExternalFrame::DmaBuf(std::sync::Arc::new(
        super::types::DmaBufFrame {
            buffer: buffer.to_owned(),
            producer,
            modifier: info.modifier(),
            stride: stride as u64,
            offset: offset as u64,
        },
    )))
}
