//! Native shared-memory video frames. Handles and leases stay outside JSON.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum PreviewTransport {
    #[default]
    Rgba,
    #[cfg(target_os = "linux")]
    DmaBuf,
}
#[derive(Clone, Debug)]
pub enum ExternalFrame {
    #[cfg(target_os = "linux")]
    DmaBuf(std::sync::Arc<DmaBufFrame>),
}
#[cfg(target_os = "linux")]
#[derive(Debug)]
pub struct DmaBufFrame {
    pub(crate) buffer: gst::Buffer,
    pub(crate) producer: gst::Buffer,
    pub modifier: u64,
    pub stride: u64,
    pub offset: u64,
}
#[cfg(target_os = "linux")]
impl DmaBufFrame {
    /// Duplicate the descriptor while both the DMA allocation and producer texture are leased.
    pub fn descriptor(&self) -> std::io::Result<std::os::fd::OwnedFd> {
        use std::os::fd::BorrowedFd;
        let memory = self
            .buffer
            .peek_memory(0)
            .downcast_memory_ref::<gst_allocators::DmaBufMemory>()
            .ok_or_else(|| std::io::Error::other("preview frame is not DMA-BUF"))?;
        // The GstMemory remains owned by self.buffer throughout the descriptor duplication.
        unsafe { BorrowedFd::borrow_raw(memory.fd()).try_clone_to_owned() }
    }
    /// Keeps the producer accessible to diagnostics without ever mapping its pixels.
    pub fn producer(&self) -> &gst::BufferRef {
        &self.producer
    }
}
