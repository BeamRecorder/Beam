//! Linked media operations preserve A/V alignment in one atomic content edit.
use crate::{Edit, EditorError, Project, Result};
use std::collections::HashSet;
use uuid::Uuid;

pub fn link(project: &mut Project, ids: &[Uuid]) -> Result<()> {
    let unique: HashSet<_> = ids.iter().copied().collect();
    if unique.len() != ids.len() || ids.len() < 2 {
        return Err(invalid("link requires at least two distinct clips"));
    }
    let first = project
        .clips
        .try_header_by_id(ids[0])?
        .ok_or_else(|| invalid("missing link clip"))?;
    if first.title.is_some() || first.generator.is_some() {
        return Err(invalid("link requires media clips"));
    }
    let mut lanes = HashSet::new();
    for id in ids {
        let c = project
            .clips
            .try_header_by_id(*id)?
            .ok_or_else(|| invalid("missing link clip"))?;
        if c.asset_id != first.asset_id
            || c.start_ms != first.start_ms
            || c.source_in_ms != first.source_in_ms
            || c.duration_ms != first.duration_ms
            || c.rate != first.rate
            || !lanes.insert(c.track_id)
            || c.link_group.is_some()
        {
            return Err(invalid(
                "linked clips must have the same source and timing on distinct lanes; unlink existing groups first",
            ));
        }
    }
    let group = Uuid::new_v4();
    for id in ids {
        project
            .clips
            .try_by_id_mut(*id)?
            .ok_or_else(|| invalid("missing link clip"))?
            .link_group = Some(group);
    }
    Ok(())
}
pub fn unlink(project: &mut Project, id: Uuid) -> Result<()> {
    let group = project
        .clips
        .try_header_by_id(id)?
        .ok_or_else(|| invalid("missing link clip"))?
        .link_group
        .ok_or_else(|| invalid("clip has no linked group"))?;
    let ids: Vec<_> = project
        .clips
        .headers()
        .filter(|clip| clip.link_group == Some(group))
        .map(|clip| clip.id)
        .collect();
    for id in ids {
        project
            .clips
            .try_by_id_mut(id)?
            .ok_or_else(|| invalid("missing link clip"))?
            .link_group = None;
    }
    Ok(())
}
/// Expands one user's intention before applying individual clip rules.
pub fn expand(project: &Project, edit: &Edit) -> Result<Vec<Edit>> {
    let id = match edit {
        Edit::Move { id, .. }
        | Edit::Trim { id, .. }
        | Edit::Split { id, .. }
        | Edit::Remove { id }
        | Edit::Retime { id, .. }
        | Edit::Duplicate { id, .. } => *id,
        _ => return Ok(vec![edit.clone()]),
    };
    let primary = project
        .clips
        .try_header_by_id(id)?
        .ok_or_else(|| invalid("missing clip"))?;
    let Some(group) = primary.link_group else {
        return Ok(vec![edit.clone()]);
    };
    project
        .clips
        .headers()
        .filter(|c| c.link_group == Some(group))
        .map(|clip| {
            Ok(match edit {
                Edit::Move {
                    track_id, start_ms, ..
                } => Edit::Move {
                    id: clip.id,
                    track_id: if clip.id == id {
                        *track_id
                    } else {
                        clip.track_id
                    },
                    start_ms: shift(clip.start_ms, *start_ms, primary.start_ms)?,
                },
                Edit::Trim {
                    source_in_ms,
                    duration_ms,
                    start_ms,
                    ..
                } => {
                    primary.rate.validate()?;
                    let delta = (i128::from(*source_in_ms) - i128::from(primary.source_in_ms))
                        * i128::from(primary.rate.denominator)
                        / i128::from(primary.rate.numerator);
                    let mapped = i128::from(clip.source_in_ms)
                        + delta * i128::from(clip.rate.numerator)
                            / i128::from(clip.rate.denominator);
                    Edit::Trim {
                        id: clip.id,
                        source_in_ms: u64::try_from(mapped)
                            .map_err(|_| invalid("linked source trim exceeds bounds"))?,
                        duration_ms: shift(clip.duration_ms, *duration_ms, primary.duration_ms)?,
                        start_ms: shift(clip.start_ms, *start_ms, primary.start_ms)?,
                    }
                }
                Edit::Split { time_ms, .. } => Edit::Split {
                    id: clip.id,
                    time_ms: *time_ms,
                },
                Edit::Remove { .. } => Edit::Remove { id: clip.id },
                Edit::Retime {
                    rate, duration_ms, ..
                } => Edit::Retime {
                    id: clip.id,
                    rate: *rate,
                    duration_ms: shift(clip.duration_ms, *duration_ms, primary.duration_ms)?,
                },
                Edit::Duplicate {
                    track_id, start_ms, ..
                } => Edit::Duplicate {
                    id: clip.id,
                    track_id: if clip.id == id {
                        *track_id
                    } else {
                        clip.track_id
                    },
                    start_ms: shift(clip.start_ms, *start_ms, primary.start_ms)?,
                },
                _ => unreachable!(),
            })
        })
        .collect()
}
fn shift(value: u64, target: u64, previous: u64) -> Result<u64> {
    u64::try_from(i128::from(value) + i128::from(target) - i128::from(previous))
        .map_err(|_| invalid("linked edit exceeds timeline bounds"))
}
pub fn validate(project: &Project) -> Result<()> {
    let mut groups = std::collections::HashMap::<Uuid, Vec<&crate::collections::ClipHeader>>::new();
    for c in project.clips.headers() {
        if let Some(group) = c.link_group {
            groups.entry(group).or_default().push(c);
        }
    }
    for (id, clips) in groups {
        let first = clips[0];
        let mut lanes = HashSet::new();
        if id.is_nil() || clips.len() < 2 {
            return Err(invalid("linked group must contain at least two clips"));
        }
        for c in clips {
            if c.asset_id != first.asset_id
                || c.start_ms != first.start_ms
                || c.source_in_ms != first.source_in_ms
                || c.duration_ms != first.duration_ms
                || c.rate != first.rate
                || !lanes.insert(c.track_id)
            {
                return Err(invalid(
                    "linked media timing differs; unlink before editing independently",
                ));
            }
        }
    }
    Ok(())
}
fn invalid(message: &str) -> EditorError {
    EditorError::Invalid(message.into())
}
