//! Ordered independently identified instances, with stable nodes for parameter changes.
mod batch;
mod batch_shader;
mod batch_types;
mod binding_types;
mod bindings;
mod color_math;
mod framing;
mod legacy;
mod processors;
pub(crate) mod scoped;
mod shader;
pub(crate) mod state;
mod text_placement;
pub mod types;
pub(crate) mod update;
use crate::{Clip, Project, Result, video::pipeline::media};
use beam_editor_domain::effects::{Domain, Processor, definition};
use ges::prelude::*;
use types::RenderState;

pub(crate) fn attach(
    node: &ges::Clip,
    clip: &Clip,
    project: &Project,
    state: &RenderState,
) -> Result<()> {
    text_placement::attach(node, clip, project, state)?;
    if let Some(instance) = &clip.generator
        && node.supported_formats().contains(ges::TrackType::VIDEO)
    {
        let processor = definition(
            &project.definitions,
            &instance.definition_id,
            instance.definition_version,
        )?
        .processor
        .clone();
        add(node, clip, instance, processor, state)?;
    }
    super::recording_effects::attach_cursor(node, clip, project, state)?;
    legacy::attach(node, clip, project, state)?;
    let mut pending = Vec::new();
    for instance in &clip.instances {
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
        if !matches!(definition.domain, Domain::Video | Domain::Audio) {
            return Err(media(
                "clip stacks require one-input video or audio definitions",
            ));
        }
        if let Some(kind) = batch::kind(&definition.processor) {
            // Native colour and alpha kernels have distinct surface conversion
            // rules. Materialize a family change so a single colour followed by
            // alpha retains the native RGBA8 result, including migrated V1 FX.
            if pending
                .last()
                .is_some_and(|previous: &batch_types::BatchOperation| previous.kind != kind)
            {
                flush(node, clip, project, state, &mut pending)?;
            }
            pending.push(batch_types::BatchOperation {
                id: instance.id,
                kind,
            });
            if pending.len() == batch_types::MAX_BATCH_OPERATIONS {
                batch::attach(node, clip.id, std::mem::take(&mut pending), state.clone())?;
            }
        } else {
            flush(node, clip, project, state, &mut pending)?;
            add(node, clip, instance, definition.processor.clone(), state)?;
        }
    }
    flush(node, clip, project, state, &mut pending)?;
    Ok(())
}
fn flush(
    node: &ges::Clip,
    clip: &Clip,
    project: &Project,
    state: &RenderState,
    pending: &mut Vec<batch_types::BatchOperation>,
) -> Result<()> {
    if pending.len() == 1 {
        let instance = clip
            .instances
            .iter()
            .find(|i| i.id == pending[0].id)
            .ok_or_else(|| media("missing batch instance"))?;
        let processor = definition(
            &project.definitions,
            &instance.definition_id,
            instance.definition_version,
        )?
        .processor
        .clone();
        pending.clear();
        add(node, clip, instance, processor, state)
    } else if pending.is_empty() {
        Ok(())
    } else {
        batch::attach(node, clip.id, std::mem::take(pending), state.clone())
    }
}

/// Compiled clip instances retain their identities in GPU passes and native source hooks.
pub fn compiled_instances(pipeline: &ges::Pipeline) -> Vec<uuid::Uuid> {
    super::scoped_pipeline::nodes(pipeline)
        .into_iter()
        .flat_map(|clip| {
            let mut ids = text_placement::identities(&clip);
            for effect in clip.top_effects() {
                ids.extend(batch::identities(&effect).unwrap_or_else(|| {
                    effect
                        .name()
                        .and_then(|name| {
                            name.strip_prefix("fx-")
                                .and_then(|id| uuid::Uuid::parse_str(id).ok())
                        })
                        .into_iter()
                        .collect()
                }));
            }
            ids
        })
        .collect()
}
fn add(
    node: &ges::Clip,
    clip: &Clip,
    instance: &beam_editor_domain::effects::Instance,
    processor: Processor,
    state: &RenderState,
) -> Result<()> {
    if matches!(processor, Processor::TextPlacement) {
        return Ok(());
    }
    if matches!(processor, Processor::Framing) {
        let effect = framing::effect()?;
        effect
            .set_name(Some(&format!("fx-{}", instance.id)))
            .map_err(media)?;
        node.add_top_effect(&effect, 0).map_err(media)?;
        return framing::bind(&effect, state, clip.id, instance.id);
    }
    let recording = matches!(processor, Processor::CameraZoom | Processor::Cursor);
    let effect = if recording {
        let snapshots = state.read().unwrap_or_else(|p| p.into_inner());
        let asset = snapshots
            .get(&clip.id)
            .and_then(|s| s.asset.as_ref())
            .ok_or_else(|| media("recording effect has no captured source"))?;
        super::recording_effects::effect(&processor, asset, state.clone(), clip.id, instance.id)?
    } else {
        processors::effect(&processor)?
    };
    effect
        .set_name(Some(&format!("fx-{}", instance.id)))
        .map_err(media)?;
    // GES index zero is the last processor; adding there preserves document order.
    node.add_top_effect(&effect, 0).map_err(media)?;
    if !recording {
        processors::bind(&effect, processor, state.clone(), clip.id, instance.id)?;
    }
    Ok(())
}
