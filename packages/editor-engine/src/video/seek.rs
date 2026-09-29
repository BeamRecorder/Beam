//! Millisecond editor seeks must not publish an overlapping sub-millisecond stub
//! of the previous WebM frame as the new preroll at a rounded frame boundary.
use gst::prelude::*;

pub fn rounding_fragment(buffer: &gst::BufferRef) -> bool {
    buffer.flags().contains(gst::BufferFlags::DISCONT)
        && buffer
            .duration()
            .is_some_and(|duration| duration < gst::ClockTime::from_mseconds(1))
}
fn attach(element: &gst::Element) {
    if !element.factory().is_some_and(|factory| {
        factory
            .metadata("klass")
            .is_some_and(|class| class.contains("Decoder/Video"))
    }) {
        return;
    }
    if let Some(pad) = element.static_pad("src") {
        pad.add_probe(gst::PadProbeType::BUFFER, |_, info| {
            if info
                .buffer()
                .is_some_and(|buffer| rounding_fragment(buffer))
            {
                gst::PadProbeReturn::Drop
            } else {
                gst::PadProbeReturn::Ok
            }
        });
    }
}
pub(crate) fn configure(pipeline: &ges::Pipeline) {
    for element in pipeline.iterate_recurse().into_iter().flatten() {
        attach(&element);
    }
    pipeline.connect_deep_element_added(|_, _, element| attach(element));
}
