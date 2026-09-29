//! An instance never escapes the lifetime of its persistent decision guard.
use super::instance_types::InstanceClock;
use crate::{Clip, Document, EditorError, Result, collections::ItemMut, effects::Instance};
use uuid::Uuid;

pub(super) fn clip_mut(document: &mut Document, id: Uuid) -> Result<ItemMut<'_, Clip>> {
    document
        .project
        .clips
        .try_by_id_mut(id)?
        .ok_or_else(|| EditorError::Invalid("missing clip".into()))
}

pub(super) fn with_instance<T>(
    document: &mut Document,
    clip_id: Uuid,
    instance_id: Uuid,
    action: impl FnOnce(&mut Instance) -> Result<T>,
) -> Result<T> {
    if let Some(index) = document.project.transitions.iter().position(|transition| {
        transition.from_clip == clip_id && transition.instance.id == instance_id
    }) {
        return action(&mut document.project.transitions[index].instance);
    }
    let mut guard = clip_mut(document, clip_id)?;
    let clip = &mut *guard;
    let instance = clip
        .instances
        .iter_mut()
        .chain(clip.generator.iter_mut())
        .find(|instance| instance.id == instance_id)
        .ok_or_else(|| EditorError::Invalid("missing effect or generator instance".into()))?;
    action(instance)
}

pub(super) fn clock(
    document: &Document,
    clip_id: Uuid,
    instance_id: Uuid,
) -> Result<InstanceClock> {
    if let Some(transition) =
        document.project.transitions.iter().find(|transition| {
            transition.from_clip == clip_id && transition.instance.id == instance_id
        })
    {
        let clock = crate::effects::transitions::clock(&document.project.clips, transition)?;
        return Ok(InstanceClock::from(&clock));
    }
    let header = document
        .project
        .clips
        .try_header_by_id(clip_id)?
        .ok_or_else(|| EditorError::Invalid("missing clip".into()))?;
    if !header
        .instances
        .iter()
        .chain(header.generator.iter())
        .any(|instance| instance.id == instance_id)
    {
        return Err(EditorError::Invalid(
            "missing effect or generator instance".into(),
        ));
    }
    Ok(InstanceClock::from(header))
}
