//! GES 1.28's GL aggregator does not emit samples-selected. Forward its geometry
//! metadata to the GPU compositor before each input frame is converted.
use gst::prelude::*;

fn attach_pad(mixer: &gst::Element, pad: &gst::Pad) {
    if pad.direction() != gst::PadDirection::Sink {
        return;
    }
    let Some(real) = mixer.static_pad(&pad.name()) else {
        return;
    };
    pad.add_probe(gst::PadProbeType::BUFFER, move |_, info| {
        if let Some(meta) = info
            .buffer()
            .and_then(|buffer| buffer.meta::<ges::prelude::FrameCompositionMeta>())
        {
            real.set_properties(&[
                ("alpha", &meta.alpha()),
                ("zorder", &meta.zorder()),
                ("xpos", &(meta.pos_x().round() as i32)),
                ("ypos", &(meta.pos_y().round() as i32)),
                ("width", &(meta.width().round() as i32)),
                ("height", &(meta.height().round() as i32)),
            ]);
        }
        gst::PadProbeReturn::Ok
    });
}
fn attach(element: &gst::Element) {
    if !element
        .factory()
        .is_some_and(|factory| factory.name() == "glvideomixer")
    {
        return;
    }
    let Some(bin) = element.downcast_ref::<gst::Bin>() else {
        return;
    };
    let mixer: gst::Element = bin.property("mixer");
    for pad in bin.sink_pads() {
        attach_pad(&mixer, &pad);
    }
    bin.connect_pad_added(move |_, pad| attach_pad(&mixer, pad));
}
pub(super) fn configure(pipeline: &ges::Pipeline) {
    for element in pipeline.iterate_recurse().into_iter().flatten() {
        attach(&element);
    }
    pipeline.connect_deep_element_added(move |_, _, element| attach(element));
}
