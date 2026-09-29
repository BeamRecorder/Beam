//! GPU effects keep GES placement metadata even when a GL filter drops video tags.
use crate::{Result, video::pipeline::media};
use std::sync::{Arc, Mutex};

pub(crate) fn preserve(effect: &ges::Effect) -> Result<()> {
    use ges::prelude::*;
    let bin = effect
        .element()
        .ok_or_else(|| media("missing GPU effect"))?
        .downcast::<gst::Bin>()
        .map_err(|_| media("invalid GPU effect bin"))?;
    preserve_bin(&bin)
}

pub(crate) fn preserve_bin(bin: &gst::Bin) -> Result<()> {
    use gst::prelude::*;
    let input = bin
        .by_name("beam_gpu_input")
        .and_then(|element| element.static_pad("sink"))
        .ok_or_else(|| media("missing GPU effect input"))?;
    let output = bin
        .by_name("beam_gpu_output")
        .and_then(|element| element.static_pad("src"))
        .ok_or_else(|| media("missing GPU effect output"))?;
    let pending = Arc::new(Mutex::new(None::<gst::Buffer>));
    let source = Arc::clone(&pending);
    input.add_probe(
        gst::PadProbeType::BUFFER
            | gst::PadProbeType::EVENT_DOWNSTREAM
            | gst::PadProbeType::EVENT_FLUSH,
        move |_, info| {
            *source.lock().unwrap_or_else(|p| p.into_inner()) = info.buffer().cloned();
            gst::PadProbeReturn::Ok
        },
    );
    output.add_probe(gst::PadProbeType::BUFFER, move |_, info| {
        let source = pending.lock().unwrap_or_else(|p| p.into_inner()).take();
        if let Some(source) = source
            && let Some(target) = info.buffer_mut()
            && target.pts() == source.pts()
            && target
                .meta::<ges::prelude::FrameCompositionMeta>()
                .is_none()
            && let Some(meta) = source.meta::<ges::prelude::FrameCompositionMeta>()
            && meta
                .transform(target.make_mut(), &gst::meta::MetaTransformCopy::new(..))
                .is_err()
        {
            return gst::PadProbeReturn::Drop;
        }
        gst::PadProbeReturn::Ok
    });
    Ok(())
}
