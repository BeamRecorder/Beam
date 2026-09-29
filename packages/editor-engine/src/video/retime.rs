//! Real rate effects are recognized by GES and map clip duration to source consumption.
use crate::{Clip, Result, video::pipeline::media};
use ges::prelude::*;

pub(crate) fn attach(node: &ges::Clip, clip: &Clip) -> Result<()> {
    if clip.rate.numerator == clip.rate.denominator {
        return Ok(());
    }
    let rate = f64::from(clip.rate.numerator) / f64::from(clip.rate.denominator);
    if node.supported_formats().contains(ges::TrackType::VIDEO) {
        let effect = ges::Effect::new(&format!("video identity name=beam_gpu_input ! videorate rate={rate} ! identity name=beam_gpu_output")).map_err(media)?;
        if !effect.is_time_effect() {
            return Err(media(
                "GES does not recognize the installed video rate backend",
            ));
        }
        node.add_top_effect(&effect, 0).map_err(media)?;
        let bin = effect
            .element()
            .and_then(|e| e.downcast::<gst::Bin>().ok())
            .ok_or_else(|| media("missing video rate graph"))?;
        super::gpu::meta::preserve_retimed(&bin)?;
    }
    if node.supported_formats().contains(ges::TrackType::AUDIO) {
        if !(0.1..=10.).contains(&rate) {
            return Err(media(
                "the installed pitch audio backend supports rates from 0.1 to 10",
            ));
        }
        let effect = ges::Effect::new(&format!("audio pitch tempo={rate}")).map_err(media)?;
        if !effect.is_time_effect() {
            return Err(media(
                "GES does not recognize the installed audio rate backend",
            ));
        }
        node.add_top_effect(&effect, 0).map_err(media)?;
    }
    Ok(())
}
