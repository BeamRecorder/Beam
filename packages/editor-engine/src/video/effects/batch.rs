//! Consecutive point operations share GL surfaces; geometry and extension nodes
//! remain barriers. Each binding is evaluated independently in document order.
use super::{
    batch_types::{BatchKind, BatchOperation},
    types::RenderState,
};
use crate::{Result, video::pipeline::media};
use beam_editor_domain::effects::Processor;
use ges::prelude::*;
use uuid::Uuid;
const IDS_KEY: &str = "beam-editor-batch-instances-v1";

pub(crate) fn kind(processor: &Processor) -> Option<BatchKind> {
    match processor {
        Processor::ColorBalance => Some(BatchKind::Color),
        Processor::Opacity => Some(BatchKind::Opacity),
        _ => None,
    }
}
pub(crate) fn attach(
    node: &ges::Clip,
    clip_id: Uuid,
    operations: Vec<BatchOperation>,
    state: RenderState,
) -> Result<()> {
    attach_for_scope(
        node,
        super::binding_types::EffectScope::Clip(clip_id),
        operations,
        state,
    )
}
pub(crate) fn attach_for_scope(
    node: &ges::Clip,
    scope: super::binding_types::EffectScope,
    operations: Vec<BatchOperation>,
    state: RenderState,
) -> Result<()> {
    let effect = super::processors::effect(&Processor::Opacity)?;
    effect
        .set_name(Some(&format!("fx-batch-{}", operations[0].id)))
        .map_err(media)?;
    // SAFETY: this private identity list is attached once and has one writer/type.
    unsafe {
        effect.set_data(
            IDS_KEY,
            operations.iter().map(|op| op.id).collect::<Vec<_>>(),
        );
    }
    let target = super::shader::set_fragment(&effect, &super::batch_shader::fragment(&operations))?;
    node.add_top_effect(&effect, 0).map_err(media)?;
    let weak = target.downgrade();
    target
        .static_pad("sink")
        .ok_or_else(|| media("batch shader has no input"))?
        .add_probe(gst::PadProbeType::BUFFER, move |_, info| {
            let Some(target) = weak.upgrade() else {
                return gst::PadProbeReturn::Ok;
            };
            let evaluated = (|| -> Result<()> {
                let pts = info
                    .buffer()
                    .and_then(|b| b.pts())
                    .ok_or_else(|| media("batch buffer has no timestamp"))?;
                super::bindings::evaluate(&state, scope, pts, |clock, _, instances, _, time| {
                    let mut uniforms = gst::Structure::new_empty("uniforms");
                    for (index, operation) in operations.iter().enumerate() {
                        let instance = instances
                            .iter()
                            .find(|i| i.id == operation.id)
                            .ok_or_else(|| media("batch has no instance decision"))?;
                        let active = instance.active(clock, time)?;
                        let n = |key, default| {
                            super::processors::number(instance, clock, key, time, default, active)
                        };
                        match operation.kind {
                            BatchKind::Color => {
                                let values = super::color_math::uniforms(
                                    n("brightness", 0.)?,
                                    n("contrast", 1.)?,
                                    n("hue", 0.)?,
                                    n("saturation", 1.)?,
                                );
                                for (component, value) in
                                    values.coefficients.into_iter().enumerate()
                                {
                                    uniforms.set(format!("m{index}_{component}"), value);
                                }
                                uniforms.set(format!("d{index}"), values.constant);
                                uniforms.set(
                                    format!("p{index}"),
                                    if values.passthrough { 1_f32 } else { 0_f32 },
                                );
                            }
                            BatchKind::Opacity => {
                                uniforms.set(format!("a{index}"), n("opacity", 1.)? as f32)
                            }
                        }
                    }
                    target.set_property("uniforms", uniforms);
                    Ok(())
                })
            })();
            super::state::probe_result(&target, evaluated)
        });
    Ok(())
}

pub(crate) fn identities(effect: &ges::TrackElement) -> Option<Vec<Uuid>> {
    // SAFETY: attach stores this exact list type; the caller retains the effect.
    unsafe {
        effect
            .data::<Vec<Uuid>>(IDS_KEY)
            .map(|ids| ids.as_ref().clone())
    }
}
