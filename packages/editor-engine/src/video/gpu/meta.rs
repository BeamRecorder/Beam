//! Keep placement and upstream texture leases across asynchronous GL conversion.
use crate::{Result, video::pipeline::media};
use gst::prelude::*;
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
    preserve_with_timing(bin, false)
}
/// Videorate changes PTS and can repeat/drop frames. Retain only placement metadata,
/// never a GPU input surface, until the next input or flush replaces it.
pub(crate) fn preserve_retimed(bin: &gst::Bin) -> Result<()> {
    preserve_with_timing(bin, true)
}
fn preserve_with_timing(bin: &gst::Bin, retimed: bool) -> Result<()> {
    let input = bin
        .by_name("beam_gpu_input")
        .and_then(|element| element.static_pad("sink"))
        .ok_or_else(|| media("missing GPU effect input"))?;
    let output = bin
        .by_name("beam_gpu_output")
        .and_then(|element| element.static_pad("src"))
        .ok_or_else(|| media("missing GPU effect output"))?;
    preserve_pads(&input, &output, retimed);
    Ok(())
}

/// glcolorconvert can release an imported VA input while its draw is in flight.
/// Its output fence orders draws, while this lease prevents source-pool reuse.
pub(crate) fn protect(input: &gst::Pad, output: &gst::Pad) {
    preserve_pads(input, output, false);
}

fn preserve_pads(input: &gst::Pad, output: &gst::Pad, retimed: bool) {
    let pending = Arc::new(Mutex::new(None::<gst::Buffer>));
    let source = Arc::clone(&pending);
    input.add_probe(
        gst::PadProbeType::BUFFER
            | gst::PadProbeType::EVENT_DOWNSTREAM
            | gst::PadProbeType::EVENT_FLUSH,
        move |_, info| {
            let value = if retimed {
                info.buffer().and_then(|buffer| {
                    let mut placement = gst::Buffer::new();
                    let meta = buffer.meta::<ges::prelude::FrameCompositionMeta>()?;
                    meta.transform(placement.make_mut(), &gst::meta::MetaTransformCopy::new(..))
                        .ok()?;
                    Some(placement)
                })
            } else {
                info.buffer().cloned()
            };
            *source.lock().unwrap_or_else(|p| p.into_inner()) = value;
            gst::PadProbeReturn::Ok
        },
    );
    output.add_probe(gst::PadProbeType::BUFFER, move |_, info| {
        let mut pending = pending.lock().unwrap_or_else(|p| p.into_inner());
        let source = if retimed {
            pending.clone()
        } else {
            pending.take()
        };
        drop(pending);
        if let Some(source) = source
            && let Some(target) = info.buffer_mut()
        {
            if !retimed && target.pts() != source.pts() {
                return gst::PadProbeReturn::Ok;
            }
            if target
                .meta::<ges::prelude::FrameCompositionMeta>()
                .is_none()
                && let Some(meta) = source.meta::<ges::prelude::FrameCompositionMeta>()
                && meta
                    .transform(target.make_mut(), &gst::meta::MetaTransformCopy::new(..))
                    .is_err()
            {
                return gst::PadProbeReturn::Drop;
            }
            if !retimed {
                retain(target, &source);
            }
        }
        gst::PadProbeReturn::Ok
    });
}

pub(crate) fn retain(target: &mut gst::Buffer, source: &gst::Buffer) {
    if target.as_ptr() != source.as_ptr()
        && !target
            .iter_meta::<gst::ParentBufferMeta>()
            .any(|meta| meta.parent().as_ptr() == source.as_ptr())
    {
        gst::ParentBufferMeta::add(target.make_mut(), source);
    }
}
