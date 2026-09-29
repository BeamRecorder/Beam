//! Source framing changes GES composition metadata without cropping its viewport.
use super::{state::sequence_time, types::RenderState};
use crate::{Result, video::pipeline::media};
use beam_editor_domain::{effects::placement, timing::Time};
use ges::prelude::*;
use uuid::Uuid;

pub(crate) fn effect() -> Result<ges::Effect> {
    ges::Effect::new("video identity name=beam_framing").map_err(media)
}

pub(crate) fn bind(
    effect: &ges::Effect,
    shared: &RenderState,
    clip_id: Uuid,
    instance_id: Uuid,
) -> Result<()> {
    let target = effect
        .element()
        .and_then(|e| e.downcast::<gst::Bin>().ok())
        .and_then(|b| b.by_name("beam_framing"))
        .ok_or_else(|| media("missing native framing processor"))?;
    let weak = target.downgrade();
    let shared = shared.clone();
    target
        .static_pad("src")
        .ok_or_else(|| media("framing processor has no output"))?
        .add_probe(gst::PadProbeType::BUFFER, move |_, info| {
            let Some(target) = weak.upgrade() else {
                return gst::PadProbeReturn::Ok;
            };
            let decision = (|| -> Result<_> {
                let pts = info
                    .buffer()
                    .and_then(|b| b.pts())
                    .ok_or_else(|| media("framing buffer has no source timestamp"))?;
                let states = shared.read().unwrap_or_else(|p| p.into_inner());
                let state = states
                    .get(&clip_id)
                    .ok_or_else(|| media("framing clip is missing from the render state"))?;
                let instance = state
                    .clip
                    .instances
                    .iter()
                    .find(|i| i.id == instance_id)
                    .ok_or_else(|| media("framing instance is missing from the render state"))?;
                let time: Time = sequence_time(&state.clip, pts)?;
                if !instance.active(&state.clip, time)? {
                    return Ok(None);
                }
                let (width, height) = state
                    .asset
                    .as_ref()
                    .map_or((state.canvas.width, state.canvas.height), |a| {
                        (a.width, a.height)
                    });
                let value = placement::frame(
                    width,
                    height,
                    &state.canvas,
                    placement::number(instance, &state.clip, "scale", time)?,
                    placement::number(instance, &state.clip, "x", time)?,
                    placement::number(instance, &state.clip, "y", time)?,
                )?;
                Ok(Some(value))
            })();
            let applied = decision.and_then(|decision| {
                if let Some(frame) = decision {
                    let buffer = info
                        .buffer_mut()
                        .ok_or_else(|| media("framing processor has no writable buffer"))?;
                    let mut meta = buffer
                        .make_mut()
                        .meta_mut::<FrameCompositionMeta>()
                        .ok_or_else(|| media("source framing requires GES composition metadata"))?;
                    meta.set_size(f64::from(frame.width), f64::from(frame.height));
                    meta.set_position(f64::from(frame.x), f64::from(frame.y));
                }
                Ok(())
            });
            if let Err(error) = applied {
                gst::element_error!(
                    target,
                    gst::StreamError::Failed,
                    ("source framing failed: {error}")
                );
                return gst::PadProbeReturn::Drop;
            }
            gst::PadProbeReturn::Ok
        });
    Ok(())
}
