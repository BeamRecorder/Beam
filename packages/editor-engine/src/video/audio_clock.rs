//! Decoder sample clocks preserve PCM through millisecond container timestamp jitter.
use crate::{Result, video::pipeline::media};
use gst::prelude::*;

const CONTAINER_JITTER_NS: i64 = 2_000_000;

pub(crate) fn configure(pipeline: &ges::Pipeline) -> Result<()> {
    for element in pipeline.iterate_recurse().into_iter().flatten() {
        decoder(&element)?;
    }
    pipeline.connect_deep_element_added(|_, _, element| {
        if let Err(error) = decoder(element) {
            gst::element_error!(
                element,
                gst::StreamError::Failed,
                ("audio sample clock configuration failed: {error}")
            );
        }
    });
    Ok(())
}

fn decoder(element: &gst::Element) -> Result<()> {
    let Some(base) = gst::glib::Type::from_name("GstAudioDecoder") else {
        return Ok(());
    };
    if !element.type_().is_a(base) {
        return Ok(());
    }
    let property = element
        .find_property("tolerance")
        .ok_or_else(|| media("audio decoder has no timestamp tolerance"))?;
    if property.value_type() != i64::static_type() {
        return Err(media(
            "audio decoder timestamp tolerance has an incompatible type",
        ));
    }
    // GstAudioDecoder retains the existing decoded samples and advances their
    // exact sample clock. Discontinuity flags and larger gaps still resynchronise.
    // Zero tolerance reanchors every Vorbis packet to WebM's rounded milliseconds,
    // and NLE clipping can consequently lose samples at a composition boundary.
    element.set_property("tolerance", CONTAINER_JITTER_NS);
    Ok(())
}
