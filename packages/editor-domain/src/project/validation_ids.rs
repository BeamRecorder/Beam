//! Cross-scope identities are checked from headers without loading clip or track FX.
use crate::{EditorError, Project, Result, collections::track_types::TrackHeader};
use std::collections::HashSet;
use uuid::Uuid;

pub(super) fn track(project: &Project, track: &TrackHeader, ids: &mut HashSet<Uuid>) -> Result<()> {
    for id in std::iter::once(track.id)
        .chain(track.instances.iter().map(|instance| instance.id))
        .chain(track.keyframe_ids.iter().copied())
    {
        insert(project, id, ids)?;
    }
    Ok(())
}
pub(super) fn sequence(project: &Project, ids: &mut HashSet<Uuid>) -> Result<()> {
    for instance in &project.sequence_instances {
        for id in std::iter::once(instance.id).chain(
            instance
                .parameters
                .values()
                .flat_map(|binding| match binding {
                    crate::animation::Binding::Constant { .. } => [].iter(),
                    crate::animation::Binding::Curve { keys, .. } => keys.iter(),
                })
                .map(|key| key.id),
        ) {
            insert(project, id, ids)?;
            if project.tracks.identity_count(id) > 0 {
                return Err(invalid());
            }
        }
    }
    Ok(())
}
fn insert(project: &Project, id: Uuid, ids: &mut HashSet<Uuid>) -> Result<()> {
    if id.is_nil() || !ids.insert(id) || project.clips.identity_count(id) > 0 {
        return Err(invalid());
    }
    Ok(())
}
fn invalid() -> EditorError {
    EditorError::Invalid("duplicate or nil decision identity across scopes".into())
}
