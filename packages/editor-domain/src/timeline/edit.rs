//! Small non-destructive edit operations with atomic validation.
use crate::{Clip, Edit, EditorError, Effects, Project, Result, Track, TrackKind};
use uuid::Uuid;

/// Applies one edit to a copy; rejected operations leave the caller's project intact.
pub fn apply(project: &Project, edit: &Edit) -> Result<Project> {
    let next = apply_unvalidated(project, edit)?;
    crate::project::validation::project(&next)?;
    Ok(next)
}
/// Applies a decision within an atomic batch; the batch owner validates its final state.
pub fn apply_unvalidated(project: &Project, edit: &Edit) -> Result<Project> {
    let expanded = super::links::expand(project, edit)?;
    let mut next = project.clone();
    let original_count = next.clips.len();
    for edit in &expanded {
        apply_one(&mut next, edit)?;
    }
    if expanded.len() > 1 && matches!(edit, Edit::Split { .. } | Edit::Duplicate { .. }) {
        let group = Uuid::new_v4();
        let ids: Vec<_> = next
            .clips
            .headers()
            .skip(original_count)
            .map(|clip| clip.id)
            .collect();
        for id in ids {
            clip(&mut next, id)?.link_group = Some(group);
        }
    }
    Ok(next)
}
fn apply_one(next: &mut Project, edit: &Edit) -> Result<()> {
    match edit {
        Edit::Rename { name } => next.name = name.trim().to_owned(),
        Edit::Canvas { canvas } => next.canvas = canvas.clone(),
        Edit::AddTrack { name, kind } => {
            let track = Track::new(name.clone(), *kind);
            if *kind == TrackKind::Video {
                // GES priority zero is the uppermost layer, matching the timeline UI.
                next.tracks.try_insert(0, track)?;
            } else {
                next.tracks.try_push(track)?;
            }
        }
        Edit::Track { id, muted, hidden } => {
            let mut track = next
                .tracks
                .try_by_id_mut(*id)?
                .ok_or_else(|| missing("lane"))?;
            track.muted = *muted;
            track.hidden = *hidden;
        }
        Edit::TrackRename { id, name } => {
            next.tracks
                .try_by_id_mut(*id)?
                .ok_or_else(|| missing("lane"))?
                .name = name.trim().to_owned()
        }
        Edit::TrackReorder { id, index } => {
            next.tracks
                .try_header_by_id(*id)?
                .ok_or_else(|| missing("lane"))?;
            if *index >= next.tracks.len() {
                return Err(missing("lane order"));
            }
            let track = next
                .tracks
                .try_remove(*id)?
                .ok_or_else(|| missing("lane"))?;
            next.tracks.try_insert(*index, (*track).clone())?;
        }
        Edit::TrackRemove { id, delete_clips } => {
            next.tracks
                .try_header_by_id(*id)?
                .ok_or_else(|| missing("lane"))?;
            if !delete_clips && next.clips.headers().any(|c| c.track_id == *id) {
                return Err(EditorError::Invalid(
                    "lane is not empty; explicitly request deletion of its clips".into(),
                ));
            }
            let removed: std::collections::HashSet<_> = next
                .clips
                .headers()
                .filter(|c| c.track_id == *id)
                .map(|c| c.id)
                .collect();
            next.tracks.try_remove(*id)?;
            next.clips.try_retain(|c| !removed.contains(&c.id))?;
            next.transitions
                .retain(|t| !removed.contains(&t.from_clip) && !removed.contains(&t.to_clip));
            let mut groups = std::collections::HashMap::new();
            for c in next.clips.headers() {
                if let Some(group) = c.link_group {
                    *groups.entry(group).or_insert(0) += 1;
                }
            }
            let unlinked: Vec<_> = next
                .clips
                .headers()
                .filter(|c| {
                    c.link_group
                        .is_some_and(|g| groups.get(&g).copied().unwrap_or(0) < 2)
                })
                .map(|c| c.id)
                .collect();
            for id in unlinked {
                clip(next, id)?.link_group = None;
            }
        }
        Edit::Link { ids } => super::links::link(next, ids)?,
        Edit::Unlink { id } => super::links::unlink(next, *id)?,
        Edit::RecordingStyle { style } => next.recording_style = style.clone(),
        Edit::CursorStyle { id, style } => clip(next, *id)?.cursor_style = style.clone(),
        Edit::ApplySuggestion { clip_id, index } => {
            let target = next
                .clips
                .try_by_id(*clip_id)?
                .ok_or_else(|| missing("clip"))?;
            let asset = next
                .assets
                .iter()
                .find(|a| a.id == target.asset_id)
                .ok_or_else(|| missing("recording source"))?;
            let instance = crate::recording::decisions::from_suggestion(
                &target,
                asset,
                *index,
                &next.recording_style.zoom,
            )?;
            clip(next, *clip_id)?.instances.push(instance);
        }
        Edit::Insert {
            asset_id,
            track_id,
            start_ms,
        } => {
            let asset = next
                .assets
                .iter()
                .find(|a| a.id == *asset_id)
                .ok_or_else(|| missing("asset"))?;
            let mut clip = Clip {
                id: Uuid::new_v4(),
                asset_id: *asset_id,
                track_id: *track_id,
                start_ms: *start_ms,
                source_in_ms: 0,
                duration_ms: asset.duration_ms,
                effects: Effects::default(),
                title: None,
                instances: vec![],
                rate: Default::default(),
                animation_offset_ms: 0,
                generator: None,
                link_group: None,
                cursor_style: None,
            };
            crate::recording::decisions::apply_suggestions(&mut clip, asset);
            next.clips.try_push(clip)?;
        }
        Edit::InsertTitle { title, start_ms } => {
            let track = Track::new("Text".into(), TrackKind::Video);
            next.clips.try_push(Clip {
                id: Uuid::new_v4(),
                asset_id: Uuid::nil(),
                track_id: track.id,
                start_ms: *start_ms,
                source_in_ms: 0,
                duration_ms: 5000,
                effects: Effects::default(),
                title: Some(title.clone()),
                instances: vec![],
                rate: Default::default(),
                animation_offset_ms: 0,
                generator: None,
                link_group: None,
                cursor_style: None,
            })?;
            next.tracks.try_insert(0, track)?;
        }
        Edit::Title { id, title } => {
            let mut clip = clip(next, *id)?;
            if clip.title.is_none() {
                return Err(EditorError::Invalid("clip is not a title".into()));
            }
            clip.title = Some(title.clone());
        }
        Edit::Move {
            id,
            track_id,
            start_ms,
        } => {
            let mut c = clip(next, *id)?;
            c.track_id = *track_id;
            c.start_ms = *start_ms;
        }
        Edit::Trim {
            id,
            source_in_ms,
            duration_ms,
            start_ms,
        } => {
            let mut c = clip(next, *id)?;
            c.rate.validate()?;
            let delta = i128::from(*source_in_ms) - i128::from(c.source_in_ms);
            let local_delta = delta * i128::from(c.rate.denominator) / i128::from(c.rate.numerator);
            c.animation_offset_ms = i64::try_from(i128::from(c.animation_offset_ms) + local_delta)
                .map_err(|_| EditorError::Invalid("animation origin overflow".into()))?;
            c.source_in_ms = *source_in_ms;
            c.duration_ms = *duration_ms;
            c.start_ms = *start_ms;
            c.effects.fade_in_ms = c.effects.fade_in_ms.min(c.duration_ms / 2);
            c.effects.fade_out_ms = c
                .effects
                .fade_out_ms
                .min(c.duration_ms - c.effects.fade_in_ms);
        }
        Edit::Split { id, time_ms } => {
            let mut c = clip(next, *id)?;
            if *time_ms <= c.start_ms
                || c.start_ms
                    .checked_add(c.duration_ms)
                    .is_none_or(|end| *time_ms >= end)
            {
                return Err(EditorError::Invalid("split must be inside the clip".into()));
            }
            let offset = time_ms - c.start_ms;
            let mut right = c.clone();
            right.id = Uuid::new_v4();
            right.start_ms = *time_ms;
            right.source_in_ms = right
                .source_in_ms
                .checked_add(right.rate.source_offset(offset)?)
                .ok_or_else(|| EditorError::Invalid("source split overflow".into()))?;
            right.animation_offset_ms = right
                .animation_offset_ms
                .checked_add(
                    i64::try_from(offset)
                        .map_err(|_| EditorError::Invalid("split offset overflow".into()))?,
                )
                .ok_or_else(|| EditorError::Invalid("animation split overflow".into()))?;
            right.instances = right
                .instances
                .iter()
                .map(crate::effects::Instance::duplicate)
                .collect();
            right.generator = right
                .generator
                .as_ref()
                .map(crate::effects::Instance::duplicate);
            right.duration_ms -= offset;
            right.effects.fade_in_ms = 0;
            right.effects.fade_out_ms = right.effects.fade_out_ms.min(right.duration_ms);
            c.duration_ms = offset;
            c.effects.fade_out_ms = 0;
            c.effects.fade_in_ms = c.effects.fade_in_ms.min(c.duration_ms);
            let right_id = right.id;
            drop(c);
            next.clips.try_push(right)?;
            for transition in &mut next.transitions {
                if transition.from_clip == *id {
                    transition.from_clip = right_id;
                }
            }
        }
        Edit::Remove { id } => {
            clip(next, *id)?;
            next.clips.try_retain(|c| c.id != *id)?;
            next.transitions
                .retain(|t| t.from_clip != *id && t.to_clip != *id);
        }
        Edit::Effects { id, effects } => clip(next, *id)?.effects = effects.clone(),
        Edit::Duplicate {
            id,
            track_id,
            start_ms,
        } => {
            let mut copy = clip(next, *id)?.clone();
            copy.id = Uuid::new_v4();
            copy.track_id = *track_id;
            copy.start_ms = *start_ms;
            copy.instances = copy
                .instances
                .iter()
                .map(crate::effects::Instance::duplicate)
                .collect();
            copy.generator = copy
                .generator
                .as_ref()
                .map(crate::effects::Instance::duplicate);
            copy.link_group = copy.link_group.map(|_| Uuid::new_v4());
            next.clips.try_push(copy)?;
        }
        Edit::Retime {
            id,
            rate,
            duration_ms,
        } => {
            let mut c = clip(next, *id)?;
            c.rate = *rate;
            c.duration_ms = *duration_ms;
        }
        Edit::EffectAdd { clip_id, instance } => {
            clip(next, *clip_id)?.instances.push(instance.clone())
        }
        Edit::EffectUpdate { clip_id, instance } => {
            let mut c = clip(next, *clip_id)?;
            let target = c
                .instances
                .iter_mut()
                .find(|i| i.id == instance.id)
                .ok_or_else(|| missing("effect instance"))?;
            if target.definition_id != instance.definition_id
                || target.definition_version != instance.definition_version
            {
                return Err(missing("same effect definition"));
            }
            *target = instance.clone();
        }
        Edit::EffectRemove {
            clip_id,
            instance_id,
        } => {
            let mut c = clip(next, *clip_id)?;
            let index = c
                .instances
                .iter()
                .position(|i| i.id == *instance_id)
                .ok_or_else(|| missing("effect instance"))?;
            c.instances.remove(index);
        }
        Edit::EffectReorder {
            clip_id,
            instance_id,
            index,
        } => {
            let mut c = clip(next, *clip_id)?;
            if *index >= c.instances.len() {
                return Err(missing("stack position"));
            }
            let old = c
                .instances
                .iter()
                .position(|i| i.id == *instance_id)
                .ok_or_else(|| missing("effect instance"))?;
            let value = c.instances.remove(old);
            c.instances.insert(*index, value);
        }
        Edit::TransitionAdd { transition } => next.transitions.push(transition.clone()),
        Edit::TransitionUpdate { transition } => {
            let target = next
                .transitions
                .iter_mut()
                .find(|t| t.instance.id == transition.instance.id)
                .ok_or_else(|| missing("transition"))?;
            if target.instance.definition_id != transition.instance.definition_id
                || target.instance.definition_version != transition.instance.definition_version
            {
                return Err(missing("same transition definition"));
            }
            *target = transition.clone();
        }
        Edit::TransitionRemove { id } => {
            let index = next
                .transitions
                .iter()
                .position(|t| t.instance.id == *id)
                .ok_or_else(|| missing("transition"))?;
            next.transitions.remove(index);
        }
        Edit::InsertGenerator {
            track_id,
            start_ms,
            duration_ms,
            instance,
        } => next.clips.try_push(Clip {
            id: Uuid::new_v4(),
            asset_id: Uuid::nil(),
            track_id: *track_id,
            start_ms: *start_ms,
            source_in_ms: 0,
            duration_ms: *duration_ms,
            effects: Effects::default(),
            title: None,
            generator: Some(instance.clone()),
            instances: vec![],
            rate: Default::default(),
            animation_offset_ms: 0,
            link_group: None,
            cursor_style: None,
        })?,
        Edit::GeneratorUpdate { clip_id, instance } => {
            let mut c = clip(next, *clip_id)?;
            let generator = c.generator.as_mut().ok_or_else(|| missing("generator"))?;
            if generator.id != instance.id
                || generator.definition_id != instance.definition_id
                || generator.definition_version != instance.definition_version
            {
                return Err(missing("same generator instance"));
            }
            *generator = instance.clone();
        }
        Edit::RippleDelete {
            start_ms,
            end_ms,
            track_ids,
        } => super::range::ripple_delete(next, *start_ms, *end_ms, track_ids)?,
        Edit::Undo {}
        | Edit::Redo {}
        | Edit::UndoProject {}
        | Edit::RedoProject {}
        | Edit::DuplicateSequence { .. }
        | Edit::AddSequence { .. }
        | Edit::SelectSequence { .. }
        | Edit::RenameSequence { .. }
        | Edit::RemoveSequence { .. } => {
            return Err(EditorError::Invalid(
                "history command requires a document".into(),
            ));
        }
    }
    Ok(())
}
fn clip(project: &mut Project, id: Uuid) -> Result<crate::collections::ItemMut<'_, Clip>> {
    project
        .clips
        .try_by_id_mut(id)?
        .ok_or_else(|| missing("clip"))
}
fn missing(name: &str) -> EditorError {
    EditorError::Invalid(format!("missing {name}"))
}
