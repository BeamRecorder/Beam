//! Shared temporal operations for media, titles, generators and their decisions.
use crate::{Clip, EditorError, Project, Result};
use uuid::Uuid;

/// Copies a window without destroying recoverable curves outside that window.
pub fn window(clip: &Clip, begin: u64, end: u64, new_id: bool) -> Result<Clip> {
    let clip_end = clip
        .start_ms
        .checked_add(clip.duration_ms)
        .ok_or_else(|| EditorError::Invalid("clip end overflow".into()))?;
    if begin < clip.start_ms || begin >= end || end > clip_end {
        return Err(EditorError::Invalid("window must lie inside clip".into()));
    }
    let offset = begin - clip.start_ms;
    let mut copy = clip.clone();
    copy.start_ms = begin;
    copy.duration_ms = end - begin;
    copy.source_in_ms = copy
        .source_in_ms
        .checked_add(copy.rate.source_offset(offset)?)
        .ok_or_else(|| EditorError::Invalid("window source overflow".into()))?;
    copy.animation_offset_ms = copy
        .animation_offset_ms
        .checked_add(
            i64::try_from(offset)
                .map_err(|_| EditorError::Invalid("window time overflow".into()))?,
        )
        .ok_or_else(|| EditorError::Invalid("window animation overflow".into()))?;
    if new_id {
        copy.id = Uuid::new_v4();
        copy.instances = copy
            .instances
            .iter()
            .map(crate::effects::Instance::duplicate)
            .collect();
        copy.generator = copy
            .generator
            .as_ref()
            .map(crate::effects::Instance::duplicate);
    }
    copy.effects.fade_in_ms = if offset == 0 {
        clip.effects.fade_in_ms.min(copy.duration_ms)
    } else {
        0
    };
    copy.effects.fade_out_ms = if end == clip_end {
        clip.effects
            .fade_out_ms
            .min(copy.duration_ms - copy.effects.fade_in_ms)
    } else {
        0
    };
    Ok(copy)
}

/// Removes a half-open sequence range and closes its gap on explicit tracks.
pub fn ripple_delete(project: &mut Project, start: u64, end: u64, tracks: &[Uuid]) -> Result<()> {
    if start >= end || tracks.is_empty() {
        return Err(EditorError::Invalid(
            "ripple requires a nonempty range and existing tracks".into(),
        ));
    }
    for id in tracks {
        if project.tracks.try_header_by_id(*id)?.is_none() {
            return Err(EditorError::Invalid(
                "ripple requires existing tracks".into(),
            ));
        }
    }
    let linked: std::collections::HashSet<_> = project
        .clips
        .headers()
        .filter(|c| tracks.contains(&c.track_id))
        .filter_map(|c| c.link_group)
        .collect();
    if project
        .clips
        .headers()
        .any(|c| c.link_group.is_some_and(|g| linked.contains(&g)) && !tracks.contains(&c.track_id))
    {
        return Err(EditorError::Invalid(
            "ripple range must include every linked lane or unlink first".into(),
        ));
    }
    let mut removed_transitions = std::collections::HashSet::new();
    for transition in &project.transitions {
        if let Some(clip) = project.clips.try_header_by_id(transition.from_clip)? {
            let cut = clip.start_ms.saturating_add(clip.duration_ms);
            if tracks.contains(&clip.track_id)
                && cut.saturating_sub(transition.duration_ms) < end
                && cut > start
            {
                removed_transitions.insert(transition.instance.id);
            }
        }
    }
    let affected = project
        .clips
        .headers()
        .filter(|clip| {
            tracks.contains(&clip.track_id)
                && clip.start_ms.saturating_add(clip.duration_ms) > start
        })
        .map(|clip| clip.id)
        .collect::<Vec<_>>();
    let mut right_groups = std::collections::HashMap::new();
    for id in affected {
        let clip = project
            .clips
            .try_by_id(id)?
            .ok_or_else(|| EditorError::Invalid("missing ripple clip".into()))?;
        if clip.start_ms >= end {
            project
                .clips
                .try_by_id_mut(id)?
                .ok_or_else(|| EditorError::Invalid("missing ripple clip".into()))?
                .start_ms -= end - start;
            continue;
        }
        let clip_end = clip
            .start_ms
            .checked_add(clip.duration_ms)
            .ok_or_else(|| EditorError::Invalid("ripple clip end overflow".into()))?;
        if clip.start_ms < start {
            *project
                .clips
                .try_by_id_mut(id)?
                .ok_or_else(|| EditorError::Invalid("missing ripple clip".into()))? =
                window(&clip, clip.start_ms, start, false)?;
        } else {
            project.clips.try_remove(id)?;
        }
        if clip_end > end {
            let mut right = window(&clip, end, clip_end, clip.start_ms < start)?;
            if clip.start_ms < start {
                right.link_group = right
                    .link_group
                    .map(|g| *right_groups.entry(g).or_insert_with(Uuid::new_v4));
            }
            right.start_ms -= end - start;
            project.clips.try_push(right)?;
        }
    }
    // A transition intersected by a range edit is explicitly removed in the same undo step.
    project.transitions.retain(|t| {
        !removed_transitions.contains(&t.instance.id)
            && project.clips.headers().any(|c| c.id == t.from_clip)
            && project.clips.headers().any(|c| c.id == t.to_clip)
    });
    Ok(())
}
