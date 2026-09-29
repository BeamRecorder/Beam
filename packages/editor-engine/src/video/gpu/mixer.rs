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
    let parent = pad
        .parent()
        .and_then(|parent| parent.downcast::<gst::Element>().ok());
    let crossfade = parent.as_ref().and_then(super::transition::crossfade);
    let transition = crossfade.is_some();
    let controller = if transition {
        parent
            .and_then(|parent| parent.parent())
            .and_then(|parent| parent.downcast::<gst::Element>().ok())
            .and_then(|parent| {
                parent.sink_pads().into_iter().find(|ghost| {
                    ghost
                        .downcast_ref::<gst::GhostPad>()
                        .and_then(|ghost| ghost.target())
                        .is_some_and(|target| target == *pad)
                })
            })
    } else {
        None
    };
    if crossfade == Some(true) {
        real.set_property_from_str("blend-function-dst-rgb", "one");
        real.set_property_from_str("blend-function-dst-alpha", "one");
    }
    let segment = std::sync::Mutex::new(None::<gst::FormattedSegment<gst::ClockTime>>);
    pad.add_probe(
        gst::PadProbeType::BUFFER | gst::PadProbeType::EVENT_DOWNSTREAM,
        move |_, info| {
            if let Some(event) = info.event()
                && let gst::EventView::Segment(event) = event.view()
            {
                *segment.lock().unwrap_or_else(|p| p.into_inner()) =
                    event.segment().downcast_ref::<gst::ClockTime>().cloned();
            }
            if let Some(meta) = info
                .buffer()
                .and_then(|buffer| buffer.meta::<ges::prelude::FrameCompositionMeta>())
            {
                let alpha = if let Some(controller) = &controller {
                    if let Some(stream) = info.buffer().and_then(|b| b.pts()).and_then(|pts| {
                        segment
                            .lock()
                            .unwrap_or_else(|p| p.into_inner())
                            .as_ref()
                            .and_then(|s| s.to_stream_time(pts))
                    }) {
                        let _ = controller.sync_values(stream);
                    }
                    meta.alpha() * controller.property::<f64>("alpha")
                } else {
                    meta.alpha()
                };
                let zorder = if transition {
                    real.property::<u32>("zorder")
                } else {
                    meta.zorder()
                };
                real.set_properties(&[
                    ("alpha", &alpha),
                    ("zorder", &zorder),
                    ("xpos", &(meta.pos_x().round() as i32)),
                    ("ypos", &(meta.pos_y().round() as i32)),
                    ("width", &(meta.width().round() as i32)),
                    ("height", &(meta.height().round() as i32)),
                ]);
            }
            gst::PadProbeReturn::Ok
        },
    );
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
    // Every final canvas has an explicit background clip; isolated lanes need
    // transparent pixels so their post-mix opacity and subsequent layering work.
    mixer.set_property_from_str("background", "transparent");
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
