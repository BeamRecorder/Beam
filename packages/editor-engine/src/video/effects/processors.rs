//! Specialized GStreamer adapters consume the shared typed curve evaluator.
use super::{shader, types::RenderState};
use crate::{Result, video::pipeline::media};
use beam_editor_domain::{
    animation::Value,
    effects::{Instance, Processor},
    timing::{ClipClock, Time},
};
use ges::prelude::*;
use uuid::Uuid;

pub(crate) fn effect(processor: &Processor) -> Result<ges::Effect> {
    let description = match processor {
        Processor::ColorBalance => "glcolorbalance name=beam_processor",
        Processor::Transform | Processor::Opacity | Processor::Shader { .. } | Processor::Solid => {
            "glshader name=beam_processor"
        }
        Processor::Gain => {
            return ges::Effect::new("audio volume name=beam_processor").map_err(media);
        }
        _ => return Err(media("this definition is not a one-input effect")),
    };
    let effect = ges::Effect::new(&format!("video glupload name=beam_gpu_input ! glcolorconvert ! {description} ! identity name=beam_gpu_output")).map_err(media)?;
    match processor {
        Processor::Transform => {
            shader::set_fragment(&effect, &shader::transform())?;
        }
        Processor::Opacity => {
            shader::set_fragment(&effect, &shader::opacity())?;
        }
        Processor::Solid => {
            shader::set_fragment(&effect, &shader::solid())?;
        }
        Processor::Shader { fragment } => {
            shader::set_fragment(&effect, &shader::extension(fragment)?)?;
        }
        _ => {}
    }
    super::super::gpu::meta::preserve(&effect)?;
    Ok(effect)
}
pub(crate) fn bind(
    effect: &ges::Effect,
    processor: Processor,
    state: RenderState,
    clip_id: Uuid,
    instance_id: Uuid,
) -> Result<()> {
    bind_for_scope(
        effect,
        processor,
        state,
        super::binding_types::EffectScope::Clip(clip_id),
        instance_id,
    )
}
pub(crate) fn bind_for_scope(
    effect: &ges::Effect,
    processor: Processor,
    state: RenderState,
    scope: super::binding_types::EffectScope,
    instance_id: Uuid,
) -> Result<()> {
    let target = processor_node(effect)?;
    let weak = target.downgrade();
    target
        .static_pad("sink")
        .ok_or_else(|| media("effect has no sink pad"))?
        .add_probe(gst::PadProbeType::BUFFER, move |_, info| {
            let Some(target) = weak.upgrade() else {
                return gst::PadProbeReturn::Ok;
            };
            let evaluated = (|| -> Result<()> {
                let pts = info
                    .buffer()
                    .and_then(|buffer| buffer.pts())
                    .ok_or_else(|| media("effect buffer has no timestamp"))?;
                super::bindings::evaluate(
                    &state,
                    scope,
                    pts,
                    |clock, muted, instances, generator, time| {
                        let instance = instances
                            .iter()
                            .chain(generator)
                            .find(|i| i.id == instance_id)
                            .ok_or_else(|| media("effect has no instance decisions"))?;
                        apply(&target, &processor, clock, muted, instance, time)
                    },
                )
            })();
            super::state::probe_result(&target, evaluated)
        });
    Ok(())
}
pub(crate) fn processor_node(effect: &ges::Effect) -> Result<gst::Element> {
    effect
        .element()
        .and_then(|element| element.downcast::<gst::Bin>().ok())
        .and_then(|bin| bin.by_name("beam_processor"))
        .ok_or_else(|| media("missing processing element"))
}
pub(crate) fn number(
    instance: &Instance,
    clock: &(impl ClipClock + ?Sized),
    key: &str,
    time: Time,
    default: f64,
    active: bool,
) -> Result<f64> {
    if !active {
        return Ok(default);
    }
    Ok(instance
        .parameters
        .get(key)
        .map(|b| b.at_sequence(clock, time))
        .transpose()?
        .and_then(|v| v.number())
        .unwrap_or(default))
}
pub(crate) fn apply(
    target: &gst::Element,
    processor: &Processor,
    clock: &(impl ClipClock + ?Sized),
    muted: bool,
    instance: &Instance,
    time: Time,
) -> Result<()> {
    let active = instance.active(clock, time)?;
    let n = |key, default| number(instance, clock, key, time, default, active);
    match processor {
        Processor::ColorBalance => target.set_properties(&[
            ("brightness", &n("brightness", 0.)?),
            ("saturation", &n("saturation", 1.)?),
            ("contrast", &n("contrast", 1.)?),
            ("hue", &n("hue", 0.)?),
        ]),
        Processor::Transform => {
            let dimensions = target
                .static_pad("sink")
                .and_then(|pad| pad.current_caps())
                .and_then(|caps| {
                    caps.structure(0).and_then(|s| {
                        Some((s.get::<i32>("width").ok()?, s.get::<i32>("height").ok()?))
                    })
                });
            let aspect =
                dimensions.map_or(1_f32, |(width, height)| width as f32 / height.max(1) as f32);
            target.set_property(
                "uniforms",
                gst::Structure::builder("uniforms")
                    .field("beam_scale_x", n("scaleX", 1.)? as f32)
                    .field("beam_scale_y", n("scaleY", 1.)? as f32)
                    .field("beam_x", n("x", 0.)? as f32)
                    .field("beam_y", -n("y", 0.)? as f32)
                    .field("beam_rotation", n("rotation", 0.)? as f32)
                    .field("beam_anchor_x", n("anchorX", 0.5)? as f32)
                    .field("beam_anchor_y", (1. - n("anchorY", 0.5)?) as f32)
                    .field("beam_aspect", aspect)
                    .build(),
            );
        }
        Processor::Gain => target.set_property("volume", if muted { 0. } else { n("volume", 1.)? }),
        Processor::Opacity => target.set_property(
            "uniforms",
            gst::Structure::builder("uniforms")
                .field("beam_opacity", n("opacity", 1.)? as f32)
                .build(),
        ),
        Processor::Shader { .. } => {
            let mut uniforms = gst::Structure::builder("uniforms")
                .field("beam_active", if active { 1_f32 } else { 0_f32 })
                .build();
            for (key, binding) in &instance.parameters {
                let value = binding
                    .at_sequence(clock, time)?
                    .number()
                    .ok_or_else(|| media("shader uniform is not numeric"))?;
                uniforms.set(key, value as f32);
            }
            target.set_property("uniforms", uniforms);
        }
        Processor::Solid => {
            let color = if active {
                instance
                    .parameters
                    .get("color")
                    .map(|b| b.at_sequence(clock, time))
                    .transpose()?
            } else {
                None
            };
            let Some(Value::Color(color)) = color else {
                target.set_property("uniforms", color_uniforms([0.; 4]));
                return Ok(());
            };
            target.set_property("uniforms", color_uniforms(color));
        }
        _ => {}
    }
    Ok(())
}
fn color_uniforms(color: [f64; 4]) -> gst::Structure {
    gst::Structure::builder("uniforms")
        .field("beam_r", color[0] as f32)
        .field("beam_g", color[1] as f32)
        .field("beam_b", color[2] as f32)
        .field("beam_a", color[3] as f32)
        .build()
}
