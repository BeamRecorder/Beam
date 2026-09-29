//! V1 decisions use stable native nodes until their document migration is published.
use super::{processors, state::sequence_time, types::RenderState};
use crate::{Clip, Project, Result, video::pipeline::media};
use beam_editor_domain::effects::Processor;
use ges::prelude::*;

pub(crate) fn attach(
    node: &ges::Clip,
    clip: &Clip,
    project: &Project,
    state: &RenderState,
) -> Result<()> {
    let formats = node.supported_formats();
    if formats.contains(ges::TrackType::VIDEO) {
        bind(node, clip, Processor::ColorBalance, state)?;
        bind(node, clip, Processor::Opacity, state)?;
        let has_camera = clip.instances.iter().any(|instance| {
            beam_editor_domain::effects::definition(
                &project.definitions,
                &instance.definition_id,
                instance.definition_version,
            )
            .is_ok_and(|definition| matches!(definition.processor, Processor::CameraZoom))
        });
        if !has_camera
            && let Some(asset) = project
                .assets
                .iter()
                .find(|a| a.id == clip.asset_id)
                .filter(|a| !a.zooms.is_empty())
        {
            let shared = state.clone();
            let id = clip.id;
            let camera = super::super::gpu::camera::effect_with_gate(asset, move || {
                shared
                    .read()
                    .unwrap_or_else(|p| p.into_inner())
                    .get(&id)
                    .is_some_and(|s| s.clip.effects.auto_zoom)
            })?;
            node.add_top_effect(&camera, 0).map_err(media)?;
        }
    }
    if formats.contains(ges::TrackType::AUDIO) && needs_gain(project, clip) {
        bind(node, clip, Processor::Gain, state)?;
    }
    Ok(())
}
pub(crate) fn needs_gain(project: &Project, clip: &Clip) -> bool {
    clip.effects.volume != 1.
        || clip.effects.fade_in_ms != 0
        || clip.effects.fade_out_ms != 0
        || !clip.instances.iter().any(|instance| {
            beam_editor_domain::effects::definition(
                &project.definitions,
                &instance.definition_id,
                instance.definition_version,
            )
            .is_ok_and(|definition| matches!(definition.processor, Processor::Gain))
        })
}
fn bind(node: &ges::Clip, clip: &Clip, processor: Processor, shared: &RenderState) -> Result<()> {
    let effect = processors::effect(&processor)?;
    node.add_top_effect(&effect, 0).map_err(media)?;
    let target = processors::processor_node(&effect)?;
    let weak = target.downgrade();
    let state = shared.clone();
    let id = clip.id;
    target
        .static_pad("sink")
        .ok_or_else(|| media("legacy effect has no input"))?
        .add_probe(gst::PadProbeType::BUFFER, move |_, info| {
            let Some(target) = weak.upgrade() else {
                return gst::PadProbeReturn::Ok;
            };
            let evaluated = (|| -> Result<()> {
                let pts = info
                    .buffer()
                    .and_then(|b| b.pts())
                    .ok_or_else(|| media("legacy effect buffer has no timestamp"))?;
                let states = state.read().unwrap_or_else(|p| p.into_inner());
                let state = states
                    .get(&id)
                    .ok_or_else(|| media("legacy effect has no clip decisions"))?;
                let clip = &state.clip;
                let time = sequence_time(clip, pts)?;
                let local = time.seconds() * 1000. - clip.start_ms as f64;
                let fade = envelope(clip, local);
                match processor {
                    Processor::ColorBalance => target.set_properties(&[
                        ("brightness", &clip.effects.brightness),
                        ("saturation", &clip.effects.saturation),
                    ]),
                    Processor::Opacity => {
                        let alpha = if state.hidden {
                            0.
                        } else {
                            clip.effects.opacity * fade
                        };
                        target.set_property(
                            "uniforms",
                            gst::Structure::builder("uniforms")
                                .field("beam_opacity", alpha as f32)
                                .build(),
                        );
                    }
                    Processor::Gain => target.set_property(
                        "volume",
                        if state.muted {
                            0.
                        } else {
                            clip.effects.volume * fade
                        },
                    ),
                    _ => {}
                }
                Ok(())
            })();
            super::state::probe_result(&target, evaluated)
        });
    Ok(())
}
fn envelope(clip: &Clip, local_ms: f64) -> f64 {
    let incoming = if clip.effects.fade_in_ms == 0 {
        1.
    } else {
        local_ms / clip.effects.fade_in_ms as f64
    };
    let outgoing = if clip.effects.fade_out_ms == 0 {
        1.
    } else {
        (clip.duration_ms as f64 - local_ms) / clip.effects.fade_out_ms as f64
    };
    incoming.min(outgoing).clamp(0., 1.)
}
