//! Typed command handlers; transports never implement these rules.
use super::{created, instances::clip_mut, parameters, types::*};
use crate::{Document, Edit, EditorError, Result};
use uuid::Uuid;

pub fn resolve(reference: &Reference, results: &[CommandResult]) -> Result<Uuid> {
    match reference {
        Reference::Id(id) if !id.is_nil() => Ok(*id),
        Reference::Created { created_by, index } => results
            .iter()
            .find(|result| result.command_id == *created_by)
            .and_then(|result| result.created.get(*index))
            .copied()
            .ok_or_else(|| {
                EditorError::Invalid(format!("createdBy {created_by} has no earlier result"))
            }),
        _ => Err(EditorError::Invalid("nil reference".into())),
    }
}

pub fn apply(
    next: &mut Document,
    original: &Document,
    operation: &Operation,
    results: &[CommandResult],
) -> Result<Vec<Uuid>> {
    let before = created::capture(next);
    match operation {
        Operation::ScopedEffect { target, action } => {
            super::scopes::apply(next, target, action, results)?;
        }
        Operation::Edit { edit } => {
            if crate::timeline::project_history::is_project_edit(edit) {
                *next = crate::timeline::project_history::edit(next, edit)?;
            } else if matches!(
                edit,
                Edit::Undo {} | Edit::Redo {} | Edit::SelectSequence { .. }
            ) {
                *next = crate::timeline::history::edited(next, edit)?;
            } else {
                next.project = crate::timeline::edit::apply_unvalidated(&next.project, edit)?;
            }
        }
        Operation::Insert {
            asset_id,
            track,
            start_ms,
            source_in_ms,
            duration_ms,
        } => {
            let track_id = resolve(track, results)?;
            next.project = crate::timeline::edit::apply_unvalidated(
                &next.project,
                &Edit::Insert {
                    asset_id: *asset_id,
                    track_id,
                    start_ms: *start_ms,
                },
            )?;
            let id = next
                .project
                .clips
                .headers()
                .last()
                .ok_or_else(|| EditorError::Invalid("insert did not create clip".into()))?
                .id;
            let mut clip = clip_mut(next, id)?;
            clip.source_in_ms = *source_in_ms;
            clip.duration_ms = *duration_ms;
        }
        Operation::EffectAdd {
            clip,
            definition_id,
            definition_version,
            parameters,
        } => {
            let id = resolve(clip, results)?;
            let definition = crate::effects::definition(
                &next.project.definitions,
                definition_id,
                *definition_version,
            )?;
            if matches!(
                definition.domain,
                crate::effects::Domain::Transition | crate::effects::Domain::Generator
            ) {
                return Err(EditorError::Invalid(
                    "use transition/generator insertion for this definition".into(),
                ));
            }
            let mut instance = definition.instantiate();
            instance.parameters.extend(parameters.clone());
            clip_mut(next, id)?.instances.push(instance);
        }
        Operation::ApplyPreset {
            target,
            preset_id,
            preset_version,
        } => {
            super::presets::apply_document(next, target, preset_id, *preset_version)?;
        }
        Operation::AssetRetarget {
            asset_id,
            previous_asset_id,
            clip_ids,
        } => {
            super::assets::retarget(&mut next.project, *previous_asset_id, *asset_id, clip_ids)?;
        }
        Operation::ParameterSet { .. }
        | Operation::EffectRangeAt { .. }
        | Operation::CurveSpace { .. }
        | Operation::InstanceRename { .. }
        | Operation::KeyframeAdd { .. }
        | Operation::KeyframeAt { .. }
        | Operation::KeyframeUpdate { .. }
        | Operation::KeyframeRemove { .. } => {
            parameters::apply(next, operation, results)?;
        }
        Operation::EffectDuplicate { clip, instance } => {
            let id = resolve(clip, results)?;
            let instance = resolve(instance, results)?;
            let mut target = clip_mut(next, id)?;
            let copy = target
                .instances
                .iter()
                .find(|effect| effect.id == instance)
                .ok_or_else(|| EditorError::Invalid("missing effect instance".into()))?
                .duplicate();
            target.instances.push(copy);
        }
        Operation::CopyPaste {
            clips,
            source_sequence,
            destination_track,
            start_ms,
        } => {
            let source = original
                .sequences
                .iter()
                .find(|sequence| sequence.id == *source_sequence)
                .ok_or_else(|| EditorError::Invalid("missing source sequence".into()))?;
            let tracks = source
                .state
                .clips
                .headers()
                .filter(|clip| clips.contains(&clip.id))
                .map(|clip| (clip.track_id, destination_track.clone()))
                .collect();
            super::paste::mapped(
                next,
                original,
                clips,
                *source_sequence,
                &tracks,
                *start_ms,
                results,
            )?;
        }
        Operation::PasteMapped {
            clips,
            source_sequence,
            track_map,
            start_ms,
        } => {
            super::paste::mapped(
                next,
                original,
                clips,
                *source_sequence,
                track_map,
                *start_ms,
                results,
            )?;
        }
        Operation::TransitionAdd {
            from_clip,
            to_clip,
            definition_id,
            definition_version,
            duration_ms,
        } => {
            let from_clip = resolve(from_clip, results)?;
            let to_clip = resolve(to_clip, results)?;
            let definition = crate::effects::definition(
                &next.project.definitions,
                definition_id,
                *definition_version,
            )?;
            next.project.transitions.push(crate::effects::Transition {
                instance: definition.instantiate(),
                from_clip,
                to_clip,
                duration_ms: *duration_ms,
            });
        }
        Operation::GeneratorInsert {
            track,
            definition_id,
            definition_version,
            start_ms,
            duration_ms,
            parameters,
        } => {
            let track_id = resolve(track, results)?;
            let definition = crate::effects::definition(
                &next.project.definitions,
                definition_id,
                *definition_version,
            )?;
            let mut instance = definition.instantiate();
            instance.parameters.extend(parameters.clone());
            next.project = crate::timeline::edit::apply_unvalidated(
                &next.project,
                &Edit::InsertGenerator {
                    track_id,
                    start_ms: *start_ms,
                    duration_ms: *duration_ms,
                    instance,
                },
            )?;
        }
        Operation::RegisterPack { pack } => {
            crate::effects::pack::register(&mut next.project, pack)?;
        }
    }
    if matches!(
        operation,
        Operation::Edit {
            edit: Edit::Undo {}
                | Edit::Redo {}
                | Edit::UndoProject {}
                | Edit::RedoProject {}
                | Edit::SelectSequence { .. }
        }
    ) {
        return Ok(Vec::new());
    }
    before.created(next)
}
