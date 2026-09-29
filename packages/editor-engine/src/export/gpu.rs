//! Final color conversion and GPU-memory handoff to hardware video encoders.
use crate::{Result, export::types::VideoEncoder, video::pipeline::media};
use ges::prelude::*;

pub(crate) fn attach(pipeline: &ges::Pipeline, encoder: VideoEncoder) -> Result<()> {
    let caps = super::profile::input(encoder);
    let description = if caps
        .features(0)
        .is_some_and(|features| features.contains("memory:GLMemory"))
    {
        "glcolorconvert ! video/x-raw(memory:GLMemory),format=NV12,texture-target=2D,colorimetry=bt709 ! identity"
    } else {
        #[cfg(target_os = "linux")]
        let description = if encoder.factory.starts_with("va") {
            "glcolorconvert ! video/x-raw(memory:GLMemory),format=NV12,texture-target=2D,colorimetry=bt709 ! beamlineardmabuf"
        } else {
            "glcolorconvert ! gldownload ! video/x-raw,format=NV12,colorimetry=bt709"
        };
        #[cfg(not(target_os = "linux"))]
        let description = "glcolorconvert ! gldownload ! video/x-raw,format=NV12,colorimetry=bt709";
        description
    };
    let filter = gst::parse::bin_from_description(description, true).map_err(media)?;
    let encodebin = pipeline
        .iterate_recurse()
        .into_iter()
        .flatten()
        .find(|element| {
            element
                .factory()
                .is_some_and(|factory| factory.name() == "encodebin2")
        })
        .ok_or_else(|| media("missing GES encodebin"))?;
    encodebin.set_property_from_str("flags", "no-video-conversion");
    let timeline = pipeline
        .timeline()
        .ok_or_else(|| media("missing export timeline"))?;
    let track = timeline
        .tracks()
        .into_iter()
        .find(|track| track.track_type() == ges::TrackType::VIDEO)
        .ok_or_else(|| media("missing export video track"))?;
    let input = track
        .static_pad("src")
        .ok_or_else(|| media("missing video track output"))?;
    let output = timeline
        .src_pads()
        .into_iter()
        .filter_map(|pad| pad.downcast::<gst::GhostPad>().ok())
        .find(|pad| pad.target().as_ref() == Some(&input))
        .ok_or_else(|| media("missing timeline video output"))?;
    let sink = filter
        .static_pad("sink")
        .ok_or_else(|| media("missing GPU encoder input"))?;
    let source = filter
        .static_pad("src")
        .ok_or_else(|| media("missing GPU encoder output"))?;
    output.set_target(gst::Pad::NONE).map_err(media)?;
    timeline.add(&filter).map_err(media)?;
    input.link(&sink).map_err(|error| {
        media(format!(
            "{error}: output {}, filter {}",
            input.query_caps(None),
            sink.query_caps(None)
        ))
    })?;
    output.set_target(Some(&source)).map_err(media)?;
    Ok(())
}
