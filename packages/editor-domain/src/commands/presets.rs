//! Presets update one explicitly addressed instance, independent of labels and ordering.
use crate::{EditorError, Project, Result, effects::preset_types::PresetTarget};

pub fn apply_document(
    document: &mut crate::Document,
    target: &PresetTarget,
    id: &str,
    version: u32,
) -> Result<()> {
    if let PresetTarget::Sequence {
        sequence_id,
        instance_id,
    } = target
    {
        if sequence_id.is_nil() || *sequence_id != document.active_sequence {
            return Err(invalid(
                "preset target differs from the transaction sequence",
            ));
        }
        let project = &mut document.project;
        let preset = project
            .presets
            .iter()
            .find(|p| p.id == id && p.version == version)
            .ok_or_else(|| invalid("missing preset version"))?
            .clone();
        let instance = project
            .sequence_instances
            .iter_mut()
            .find(|i| i.id == *instance_id)
            .ok_or_else(|| invalid("missing preset target sequence instance"))?;
        let mut candidate = instance.clone();
        preset.apply(&mut candidate, &project.definitions)?;
        crate::effects::scopes::validate_instances(
            &project.definitions,
            std::slice::from_ref(&candidate),
            crate::effects::ScopeTarget::Sequence,
            None,
        )?;
        *instance = candidate;
        return Ok(());
    }
    apply(&mut document.project, target, id, version)
}

pub fn apply(project: &mut Project, target: &PresetTarget, id: &str, version: u32) -> Result<()> {
    let preset = project
        .presets
        .iter()
        .find(|preset| preset.id == id && preset.version == version)
        .ok_or_else(|| invalid("missing preset version"))?
        .clone();
    preset.validate(&project.definitions)?;
    match target {
        PresetTarget::Sequence { .. } => {
            return Err(invalid(
                "sequence presets require document transaction context",
            ));
        }
        PresetTarget::Track {
            track_id,
            instance_id,
        } => {
            let mut track = project
                .tracks
                .try_by_id_mut(*track_id)?
                .ok_or_else(|| invalid("missing preset target track"))?;
            let kind = track.kind;
            let instance = track
                .instances
                .iter_mut()
                .find(|instance| instance.id == *instance_id)
                .ok_or_else(|| invalid("missing preset target track instance"))?;
            let mut candidate = instance.clone();
            preset.apply(&mut candidate, &project.definitions)?;
            crate::effects::scopes::validate_instances(
                &project.definitions,
                std::slice::from_ref(&candidate),
                crate::effects::ScopeTarget::Track,
                Some(kind),
            )?;
            *instance = candidate;
        }
        PresetTarget::Effect {
            clip_id,
            instance_id,
        }
        | PresetTarget::Generator {
            clip_id,
            instance_id,
        } => {
            let header = project
                .clips
                .try_header_by_id(*clip_id)?
                .ok_or_else(|| invalid("missing preset target clip"))?;
            let exists = match target {
                PresetTarget::Effect { .. } => header
                    .instances
                    .iter()
                    .any(|instance| instance.id == *instance_id),
                _ => header
                    .generator
                    .as_ref()
                    .is_some_and(|instance| instance.id == *instance_id),
            };
            if !exists {
                return Err(invalid("missing preset target instance"));
            }
            let mut clip = project
                .clips
                .try_by_id_mut(*clip_id)?
                .ok_or_else(|| invalid("missing preset target clip"))?;
            let instance = match target {
                PresetTarget::Effect { .. } => clip
                    .instances
                    .iter_mut()
                    .find(|instance| instance.id == *instance_id),
                _ => clip
                    .generator
                    .as_mut()
                    .filter(|instance| instance.id == *instance_id),
            }
            .ok_or_else(|| invalid("preset target differs from its headers"))?;
            preset.apply(instance, &project.definitions)?;
        }
        PresetTarget::Transition { instance_id } => {
            let instance = &mut project
                .transitions
                .iter_mut()
                .find(|transition| transition.instance.id == *instance_id)
                .ok_or_else(|| invalid("missing preset target transition"))?
                .instance;
            preset.apply(instance, &project.definitions)?;
        }
    }
    Ok(())
}
fn invalid(message: &str) -> EditorError {
    EditorError::Invalid(message.into())
}
