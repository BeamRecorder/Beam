//! Track and sequence processors run once after their input composition has mixed.
use super::{
    batch,
    batch_types::{BatchOperation, MAX_BATCH_OPERATIONS},
    binding_types::EffectScope,
    processors,
    types::RenderState,
};
use crate::{Project, Result, video::pipeline::media};
use beam_editor_domain::effects::{Domain, Instance, definition};
use ges::prelude::*;

pub(crate) fn attach(
    node: &ges::Clip,
    scope_id: uuid::Uuid,
    instances: &[Instance],
    project: &Project,
    state: &RenderState,
) -> Result<()> {
    let scope = EffectScope::Aggregate(scope_id);
    let mut pending: Vec<BatchOperation> = Vec::new();
    for instance in instances {
        let definition = definition(
            &project.definitions,
            &instance.definition_id,
            instance.definition_version,
        )?;
        if definition.domain == Domain::Video
            && !node.supported_formats().contains(ges::TrackType::VIDEO)
            || definition.domain == Domain::Audio
                && !node.supported_formats().contains(ges::TrackType::AUDIO)
        {
            continue;
        }
        if let Some(kind) = batch::kind(&definition.processor) {
            if pending.last().is_some_and(|previous| previous.kind != kind) {
                flush(node, scope, instances, project, state, &mut pending)?;
            }
            pending.push(BatchOperation {
                id: instance.id,
                kind,
            });
            if pending.len() == MAX_BATCH_OPERATIONS {
                batch::attach_for_scope(node, scope, std::mem::take(&mut pending), state.clone())?;
            }
        } else {
            flush(node, scope, instances, project, state, &mut pending)?;
            add(node, scope, instance, project, state)?;
        }
    }
    flush(node, scope, instances, project, state, &mut pending)
}
fn flush(
    node: &ges::Clip,
    scope: EffectScope,
    instances: &[Instance],
    project: &Project,
    state: &RenderState,
    pending: &mut Vec<BatchOperation>,
) -> Result<()> {
    if pending.len() == 1 {
        let instance = instances
            .iter()
            .find(|instance| instance.id == pending[0].id)
            .ok_or_else(|| media("scope batch has no instance"))?;
        pending.clear();
        add(node, scope, instance, project, state)
    } else if pending.is_empty() {
        Ok(())
    } else {
        batch::attach_for_scope(node, scope, std::mem::take(pending), state.clone())
    }
}
fn add(
    node: &ges::Clip,
    scope: EffectScope,
    instance: &Instance,
    project: &Project,
    state: &RenderState,
) -> Result<()> {
    let processor = definition(
        &project.definitions,
        &instance.definition_id,
        instance.definition_version,
    )?
    .processor
    .clone();
    let effect = processors::effect(&processor)?;
    effect
        .set_name(Some(&format!("fx-{}", instance.id)))
        .map_err(media)?;
    node.add_top_effect(&effect, 0).map_err(media)?;
    processors::bind_for_scope(&effect, processor, state.clone(), scope, instance.id)
}
