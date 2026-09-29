//! GES owns both inputs and their clocks; masks stay in RGBA GLMemory.
//! Its stock SMPTE filter only accepts CPU AYUV and cannot negotiate a GL track.
use crate::{Result, video::pipeline::media};
use beam_editor_domain::effects::{Processor, WipeDirection};
use ges::prelude::*;

const KIND_KEY: &str = "beam-video-transition-crossfade-v1";

pub(super) fn crossfade(element: &gst::Element) -> Option<bool> {
    // SAFETY: configure writes this private key once with this concrete type.
    unsafe { element.data::<bool>(KIND_KEY).map(|kind| *kind.as_ref()) }
}

pub(crate) fn configure(
    source: &ges::TrackElement,
    processor: &Processor,
    shared: super::super::effects::types::RenderState,
    instance_id: uuid::Uuid,
) -> Result<()> {
    super::source::configure(source)?;
    let Some(bin) = source.element().and_then(|e| e.downcast::<gst::Bin>().ok()) else {
        return Err(media("missing native transition graph"));
    };
    let masks: Vec<_> = bin
        .iterate_recurse()
        .into_iter()
        .flatten()
        .filter(|element| element.factory().is_some_and(|f| f.name() == "smptealpha"))
        .collect();
    let custom = matches!(processor, Processor::TransitionShader { .. });
    let clock = masks
        .iter()
        .find(|mask| mask.control_binding("position").is_some())
        .cloned();
    let elements: Vec<_> = bin.iterate_recurse().into_iter().flatten().collect();
    for element in elements {
        if element
            .factory()
            .is_some_and(|f| f.name() == "glvideomixer")
        {
            // GstObject names cannot change after parenting. The marker follows
            // this exact compositor without relying on GES-generated names.
            unsafe {
                element.set_data(KIND_KEY, matches!(processor, Processor::Crossfade) | custom);
            }
            straighten_alpha(&element)?;
        }
    }
    for original in masks {
        let replacement=gst::parse::bin_from_description("glupload name=beam_gpu_input ! glcolorconvert ! glshader name=beam_transition_mask ! identity name=beam_gpu_output",true).map_err(media)?;
        let shader = replacement
            .by_name("beam_transition_mask")
            .ok_or_else(|| media("missing transition mask shader"))?;
        let animated = original.control_binding("position").is_some();
        let (axis, inverted) = match processor {
            Processor::Wipe { direction } if animated => match direction {
                WipeDirection::Left => ("v_texcoord.x", false),
                WipeDirection::Right => ("v_texcoord.x", true),
                WipeDirection::Up => ("1.0-v_texcoord.y", false),
                WipeDirection::Down => ("1.0-v_texcoord.y", true),
            },
            _ => ("v_texcoord.x", false),
        };
        let axis = if inverted {
            format!("1.0-({axis})")
        } else {
            axis.into()
        };
        let fragment = if let Processor::TransitionShader { mask_fragment } = processor {
            super::transition_shader::fragment(mask_fragment, animated)
        } else {
            format!(
                "#ifdef GL_ES\nprecision mediump float;\n#endif\nvarying vec2 v_texcoord; uniform sampler2D tex; uniform float beam_position;\nvoid main() {{ vec4 c=texture2D(tex,v_texcoord); float alpha=step({axis},1.0-beam_position); gl_FragColor=vec4(c.rgb,c.a*alpha); }}"
            )
        };
        shader.set_property("fragment", fragment);
        let weak = shader.downgrade();
        let wipe = matches!(processor, Processor::Wipe { .. }) && animated;
        // Retain the original controller target for GES's duration/child-property updates.
        let controller = if custom {
            clock
                .clone()
                .ok_or_else(|| media("transition has no native progress controller"))?
        } else {
            original.clone()
        };
        let decisions = shared.clone();
        let segment = std::sync::Mutex::new(None::<gst::FormattedSegment<gst::ClockTime>>);
        shader
            .static_pad("sink")
            .ok_or_else(|| media("missing transition shader input"))?
            .add_probe(
                gst::PadProbeType::BUFFER | gst::PadProbeType::EVENT_DOWNSTREAM,
                move |_, info| {
                    if let Some(event) = info.event()
                        && let gst::EventView::Segment(event) = event.view()
                    {
                        *segment.lock().unwrap_or_else(|p| p.into_inner()) =
                            event.segment().downcast_ref::<gst::ClockTime>().cloned();
                    }
                    let Some(buffer) = info.buffer() else {
                        return gst::PadProbeReturn::Ok;
                    };
                    let Some(shader) = weak.upgrade() else {
                        return gst::PadProbeReturn::Ok;
                    };
                    let evaluated = (|| -> Result<()> {
                        let pts = buffer
                            .pts()
                            .ok_or_else(|| media("transition buffer has no timestamp"))?;
                        let stream = segment
                            .lock()
                            .unwrap_or_else(|p| p.into_inner())
                            .as_ref()
                            .and_then(|s| s.to_stream_time(pts));
                        if wipe || custom {
                            let stream =
                                stream.ok_or_else(|| media("transition has no stream clock"))?;
                            controller.sync_values(stream).map_err(media)?;
                        }
                        let position = if wipe {
                            controller.property::<f64>("position")
                        } else {
                            0.
                        };
                        let mut uniforms = gst::Structure::builder("uniforms")
                            .field("beam_position", position as f32)
                            .build();
                        if custom {
                            let stream =
                                stream.ok_or_else(|| media("transition has no stream clock"))?;
                            uniforms.set(
                                "beam_progress",
                                (1. - controller.property::<f64>("position")) as f32,
                            );
                            let snapshot = decisions.read().unwrap_or_else(|p| p.into_inner());
                            parameters(&mut uniforms, &snapshot, instance_id, stream)?;
                        }
                        shader.set_property("uniforms", uniforms);
                        Ok(())
                    })();
                    super::super::effects::state::probe_result(&shader, evaluated)
                },
            );
        super::meta::preserve_bin(&replacement)?;
        super::source::replace(&original, &replacement)?;
    }
    Ok(())
}

fn parameters(
    uniforms: &mut gst::Structure,
    snapshot: &super::super::effects::types::RenderDecisions,
    instance_id: uuid::Uuid,
    stream: gst::ClockTime,
) -> Result<()> {
    use beam_editor_domain::timing::{Time, TimeSpace, unmap_time};
    let transition = snapshot
        .transitions
        .get(&instance_id)
        .ok_or_else(|| media("missing transition decision"))?;
    let time = unmap_time(
        &transition.scope,
        Time {
            ticks: i64::try_from(stream.nseconds())
                .map_err(|_| media("transition clock exceeds exact timestamp budget"))?,
            timescale: 1_000_000_000,
        },
        TimeSpace::ClipLocal,
    )?;
    for (key, binding) in &transition.transition.instance.parameters {
        let value = binding
            .at_sequence(&transition.scope, time)?
            .number()
            .ok_or_else(|| media("transition uniform is not numeric"))?;
        uniforms.set(key, value as f32);
    }
    Ok(())
}

/// GL blending produces premultiplied RGB. The next GES compositor consumes
/// straight alpha, including when both transition inputs have partial opacity.
fn straighten_alpha(mixer: &gst::Element) -> Result<()> {
    let parent = mixer
        .parent()
        .and_then(|p| p.downcast::<gst::Bin>().ok())
        .ok_or_else(|| media("transition mixer has no parent"))?;
    let src = mixer
        .static_pad("src")
        .ok_or_else(|| media("transition mixer has no output"))?;
    let after = src
        .peer()
        .ok_or_else(|| media("transition mixer output is not linked"))?;
    let stage=gst::parse::bin_from_description("identity name=beam_gpu_input ! glshader name=beam_straight_alpha ! identity name=beam_gpu_output",true).map_err(media)?;
    stage.by_name("beam_straight_alpha").ok_or_else(||media("missing alpha shader"))?.set_property("fragment","#ifdef GL_ES\nprecision mediump float;\n#endif\nvarying vec2 v_texcoord; uniform sampler2D tex; void main() { vec4 c=texture2D(tex,v_texcoord); gl_FragColor=vec4(c.a>0.0?c.rgb/c.a:vec3(0.0),c.a); }");
    super::meta::preserve_bin(&stage)?;
    src.unlink(&after).map_err(media)?;
    parent.add(&stage).map_err(media)?;
    src.link_full(
        &stage
            .static_pad("sink")
            .ok_or_else(|| media("alpha shader has no input"))?,
        gst::PadLinkCheck::empty(),
    )
    .map_err(media)?;
    stage
        .static_pad("src")
        .ok_or_else(|| media("alpha shader has no output"))?
        .link_full(&after, gst::PadLinkCheck::empty())
        .map_err(media)?;
    Ok(())
}
