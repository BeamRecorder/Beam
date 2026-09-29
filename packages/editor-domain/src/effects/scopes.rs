//! Scope checks operate on one lane payload or lightweight headers, never all clips.
use super::{Definition, Domain, Instance, Processor, scope_types::ScopeTarget};
use crate::{
    EditorError, Project, Result, Track, TrackKind,
    animation::Binding,
    collections::{InstanceHeader, PersistentItem, track_types::TrackHeader},
    timing::TimeSpace,
};
use std::collections::HashSet;

pub fn supported(processor: &Processor) -> Vec<ScopeTarget> {
    if matches!(
        processor,
        Processor::ColorBalance
            | Processor::Transform
            | Processor::Opacity
            | Processor::Gain
            | Processor::Shader { .. }
    ) {
        vec![ScopeTarget::Clip, ScopeTarget::Track, ScopeTarget::Sequence]
    } else {
        vec![ScopeTarget::Clip]
    }
}

pub fn definition(definition: &Definition) -> Result<()> {
    let supported = supported(&definition.processor);
    let mut targets = HashSet::new();
    if definition.targets.is_empty()
        || definition
            .targets
            .iter()
            .any(|target| !targets.insert(*target) || !supported.contains(target))
    {
        return Err(invalid(
            "definition declares an unsupported or duplicate scope",
        ));
    }
    Ok(())
}

pub fn compatible(
    definition: &Definition,
    target: ScopeTarget,
    track_kind: Option<TrackKind>,
) -> Result<()> {
    if !definition.targets.contains(&target)
        || target != ScopeTarget::Clip
            && matches!(definition.domain, Domain::Transition | Domain::Generator)
        || track_kind == Some(TrackKind::Audio) && definition.domain != Domain::Audio
    {
        return Err(invalid(
            "effect definition is incompatible with the target scope",
        ));
    }
    Ok(())
}

pub fn validate_header(
    catalog: &[Definition],
    instance: &InstanceHeader,
    target: ScopeTarget,
    track_kind: Option<TrackKind>,
) -> Result<()> {
    let definition = super::definition(
        catalog,
        &instance.definition_id,
        instance.definition_version,
    )?;
    compatible(definition, target, track_kind)?;
    if instance.id.is_nil()
        || instance
            .name
            .as_ref()
            .is_some_and(|name| name.trim().is_empty() || name.len() > 256 || name.contains('\0'))
    {
        return Err(invalid("invalid scoped instance identity or name"));
    }
    if let Some(range) = instance.range {
        range.validate()?;
        if target != ScopeTarget::Clip && range.space != TimeSpace::Sequence {
            return Err(invalid("track and sequence ranges require sequence time"));
        }
    }
    Ok(())
}

pub fn validate_track_header(project: &Project, track: &TrackHeader) -> Result<()> {
    track_identity(track.id, &track.name)?;
    let mut identities = HashSet::from([track.id]);
    for instance in &track.instances {
        validate_header(
            &project.definitions,
            instance,
            ScopeTarget::Track,
            Some(track.kind),
        )?;
        if !identities.insert(instance.id) {
            return Err(invalid("duplicate track instance identity"));
        }
    }
    for key in &track.keyframe_ids {
        if key.is_nil() || !identities.insert(*key) {
            return Err(invalid("duplicate or nil track keyframe identity"));
        }
    }
    Ok(())
}

pub fn validate_track(project: &Project, track: &Track) -> Result<()> {
    validate_track_header(project, &track.header())?;
    validate_instances(
        &project.definitions,
        &track.instances,
        ScopeTarget::Track,
        Some(track.kind),
    )
}

pub fn validate_sequence(project: &Project, instances: &[Instance]) -> Result<()> {
    validate_instances(&project.definitions, instances, ScopeTarget::Sequence, None)
}

pub fn validate_instances(
    catalog: &[Definition],
    instances: &[Instance],
    target: ScopeTarget,
    track_kind: Option<TrackKind>,
) -> Result<()> {
    let mut identities = HashSet::new();
    for instance in instances {
        instance.validate(catalog)?;
        validate_header(catalog, &InstanceHeader::from(instance), target, track_kind)?;
        if !identities.insert(instance.id) {
            return Err(invalid("duplicate scoped instance identity"));
        }
        for binding in instance.parameters.values() {
            if let Binding::Curve { space, keys } = binding {
                if target != ScopeTarget::Clip && *space != TimeSpace::Sequence {
                    return Err(invalid("track and sequence curves require sequence time"));
                }
                for key in keys {
                    if !identities.insert(key.id) {
                        return Err(invalid("duplicate scoped keyframe identity"));
                    }
                }
            }
        }
    }
    Ok(())
}

fn track_identity(id: uuid::Uuid, name: &str) -> Result<()> {
    if id.is_nil() || name.trim().is_empty() || name.len() > 256 || name.contains('\0') {
        return Err(invalid("invalid track identity or name"));
    }
    Ok(())
}
fn invalid(message: &str) -> EditorError {
    EditorError::Invalid(message.into())
}
