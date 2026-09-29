//! Replace GES's stock CPU-only clip filters before the composition leaves NULL.
//! Timing and frame-position metadata stay owned by GES; pixels stay in GLMemory.
use crate::{Result, video::pipeline::media};
use ges::prelude::*;

pub(crate) fn configure(source: &ges::TrackElement) -> Result<()> {
    let Some(element) = source.element() else {
        return Ok(());
    };
    let Some(bin) = element.downcast_ref::<gst::Bin>() else {
        return Ok(());
    };
    let elements: Vec<_> = bin.iterate_recurse().into_iter().flatten().collect();
    for element in elements {
        let Some(factory) = element.factory() else {
            continue;
        };
        let description = match factory.name().as_str() {
            "videoconvert" => {
                "glupload name=beam_gpu_input ! glcolorconvert ! video/x-raw(memory:GLMemory),format=RGBA,texture-target=2D ! identity name=beam_gpu_output"
            }
            "videoscale" => {
                "glupload name=beam_gpu_input ! glcolorscale ! identity name=beam_gpu_output"
            }
            "videoflip" => {
                "glupload name=beam_gpu_input ! glcolorconvert ! video/x-raw(memory:GLMemory),format=RGBA,texture-target=2D ! glvideoflip video-direction=auto ! identity name=beam_gpu_output"
            }
            _ => continue,
        };
        let replacement = gst::parse::bin_from_description(description, true).map_err(media)?;
        super::meta::preserve_bin(&replacement)?;
        replace(&element, &replacement)?;
    }
    Ok(())
}
pub(crate) fn replace(old: &gst::Element, new: &gst::Bin) -> Result<()> {
    let parent = old
        .parent()
        .and_then(|parent| parent.downcast::<gst::Bin>().ok())
        .ok_or_else(|| media("GPU clip filter has no parent bin"))?;
    let sink = old
        .static_pad("sink")
        .ok_or_else(|| media("clip filter has no input"))?;
    let src = old
        .static_pad("src")
        .ok_or_else(|| media("clip filter has no output"))?;
    let before = sink
        .peer()
        .ok_or_else(|| media("clip filter input is not linked"))?;
    let after = src
        .peer()
        .ok_or_else(|| media("clip filter output is not linked"))?;
    before.unlink(&sink).map_err(media)?;
    src.unlink(&after).map_err(media)?;
    parent.remove(old).map_err(media)?;
    parent.add(new).map_err(media)?;
    // Other stock filters are still CPU-only during this NULL-state rewrite.
    // Negotiate caps once the complete GPU graph prerolls, as GES itself does.
    before
        .link_full(
            &new.static_pad("sink")
                .ok_or_else(|| media("GPU clip filter has no input"))?,
            gst::PadLinkCheck::empty(),
        )
        .map_err(media)?;
    new.static_pad("src")
        .ok_or_else(|| media("GPU clip filter has no output"))?
        .link_full(&after, gst::PadLinkCheck::empty())
        .map_err(media)?;
    Ok(())
}
