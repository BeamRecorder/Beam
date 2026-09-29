//! Small non-destructive edit operations with atomic validation.
use crate::{Clip, Edit, EditorError, Effects, Project, Result, Track, TrackKind};
use uuid::Uuid;

/// Applies one edit to a copy; rejected operations leave the caller's project intact.
pub fn apply(project: &Project, edit: &Edit) -> Result<Project> {
    let mut next = project.clone();
    match edit {
        Edit::Rename { name } => next.name = name.trim().to_owned(),
        Edit::Canvas { canvas } => next.canvas = canvas.clone(),
        Edit::AddTrack { name, kind } => {
            let track = Track::new(name.clone(), *kind);
            if *kind == TrackKind::Video {
                // GES priority zero is the uppermost layer, matching the timeline UI.
                next.tracks.insert(0, track);
            } else {
                next.tracks.push(track);
            }
        }
        Edit::Track { id, muted, hidden } => {
            let track = next
                .tracks
                .iter_mut()
                .find(|t| t.id == *id)
                .ok_or_else(|| missing("lane"))?;
            track.muted = *muted;
            track.hidden = *hidden;
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
            next.clips.push(Clip {
                id: Uuid::new_v4(),
                asset_id: *asset_id,
                track_id: *track_id,
                start_ms: *start_ms,
                source_in_ms: 0,
                duration_ms: asset.duration_ms,
                effects: Effects::default(),
                title: None,
            });
        }
        Edit::InsertTitle { title, start_ms } => {
            let track = Track::new("Text".into(), TrackKind::Video);
            next.clips.push(Clip {
                id: Uuid::new_v4(),
                asset_id: Uuid::nil(),
                track_id: track.id,
                start_ms: *start_ms,
                source_in_ms: 0,
                duration_ms: 5000,
                effects: Effects::default(),
                title: Some(title.clone()),
            });
            next.tracks.insert(0, track);
        }
        Edit::Title { id, title } => {
            let clip = clip(&mut next, *id)?;
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
            let c = clip(&mut next, *id)?;
            c.track_id = *track_id;
            c.start_ms = *start_ms;
        }
        Edit::Trim {
            id,
            source_in_ms,
            duration_ms,
            start_ms,
        } => {
            let c = clip(&mut next, *id)?;
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
            let c = clip(&mut next, *id)?;
            if *time_ms <= c.start_ms || *time_ms >= c.start_ms + c.duration_ms {
                return Err(EditorError::Invalid("split must be inside the clip".into()));
            }
            let offset = time_ms - c.start_ms;
            let mut right = c.clone();
            right.id = Uuid::new_v4();
            right.start_ms = *time_ms;
            right.source_in_ms += offset;
            right.duration_ms -= offset;
            right.effects.fade_in_ms = 0;
            right.effects.fade_out_ms = right.effects.fade_out_ms.min(right.duration_ms);
            c.duration_ms = offset;
            c.effects.fade_out_ms = 0;
            c.effects.fade_in_ms = c.effects.fade_in_ms.min(c.duration_ms);
            next.clips.push(right);
        }
        Edit::Remove { id } => {
            clip(&mut next, *id)?;
            next.clips.retain(|c| c.id != *id);
        }
        Edit::Effects { id, effects } => clip(&mut next, *id)?.effects = effects.clone(),
        Edit::Undo {}
        | Edit::Redo {}
        | Edit::AddSequence { .. }
        | Edit::SelectSequence { .. }
        | Edit::RenameSequence { .. }
        | Edit::RemoveSequence { .. } => {
            return Err(EditorError::Invalid(
                "history command requires a document".into(),
            ));
        }
    }
    crate::project::validation::project(&next)?;
    Ok(next)
}
fn clip(project: &mut Project, id: Uuid) -> Result<&mut Clip> {
    project
        .clips
        .iter_mut()
        .find(|c| c.id == id)
        .ok_or_else(|| missing("clip"))
}
fn missing(name: &str) -> EditorError {
    EditorError::Invalid(format!("missing {name}"))
}
