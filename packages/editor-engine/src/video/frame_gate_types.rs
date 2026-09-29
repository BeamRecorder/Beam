//! A preview belongs to the segment requested by the latest seek.
#[derive(Debug, Default)]
pub struct SegmentGate {
    pub(crate) expected: Option<gst::Seqnum>,
    pub(crate) active: Option<gst::Seqnum>,
    pub(crate) flushing: bool,
}
