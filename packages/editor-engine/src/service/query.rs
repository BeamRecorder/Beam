//! Compact service projections are built at the domain boundary.
use crate::{
    EditorController, EditorError, Result,
    video::types::{EditorSnapshot, Transport},
};
use beam_editor_domain::{commands::query, protocol::*};
use query::page;

pub(super) fn project(snapshot: &EditorSnapshot) -> ProjectInfo {
    ProjectInfo {
        id: snapshot.project.id,
        name: snapshot.project.name.clone(),
        revision: snapshot.revision,
        recording_style: snapshot.project.recording_style.clone(),
        active_sequence: snapshot.active_sequence,
        canvas: snapshot.project.canvas.clone(),
        asset_count: snapshot.project.assets.len(),
        sequence_count: snapshot.sequences.len(),
        can_undo: snapshot.can_undo,
        can_redo: snapshot.can_redo,
        can_project_undo: snapshot.can_project_undo,
        can_project_redo: snapshot.can_project_redo,
        recovered: snapshot.recovered,
        warnings: snapshot.project.warnings.clone(),
    }
}
pub(super) fn transport(value: Transport) -> TransportInfo {
    TransportInfo {
        position_ms: value.position_ms,
        duration_ms: value.duration_ms,
        playing: value.playing,
        error: value.error,
    }
}
pub(super) fn read(controller: &EditorController, query: Query) -> Result<Response> {
    if matches!(query, Query::Project) {
        return controller.snapshot().map(|s| Response::Project {
            project: project(&s),
        });
    }
    let document = controller.document()?;
    let revision = document.revision;
    let sequence = |id| {
        document
            .sequences
            .iter()
            .find(|s| s.id == id)
            .ok_or_else(|| EditorError::Invalid("missing sequence".into()))
    };
    match query {
        Query::Grants { .. } | Query::Jobs { .. } | Query::Artifacts { .. } => Err(
            EditorError::Invalid("host resources must be queried through the owner service".into()),
        ),
        Query::Project => unreachable!(),
        Query::Sequences { offset, limit } => {
            let values: Vec<_> = document.sequences.iter().map(SequenceInfo::from).collect();
            Ok(Response::Sequences {
                page: page(revision, &values, offset, limit)?,
            })
        }
        Query::Assets { offset, limit } => {
            let values: Vec<_> = document
                .project
                .assets
                .iter()
                .map(AssetInfo::from)
                .collect();
            Ok(Response::Assets {
                page: page(revision, &values, offset, limit)?,
            })
        }
        Query::Asset { id } => {
            let asset = document
                .project
                .assets
                .iter()
                .find(|asset| asset.id == id)
                .ok_or_else(|| EditorError::Invalid("missing source version".into()))?;
            Ok(Response::Asset {
                revision,
                asset: AssetInfo::from(asset),
            })
        }
        Query::Tracks {
            sequence_id,
            offset,
            limit,
        } => Ok(Response::Tracks {
            page: query::tracks(&document, sequence_id, offset, limit)?,
        }),
        Query::Track {
            sequence_id,
            track_id,
        } => Ok(Response::Track {
            revision,
            track: query::track(&document, sequence_id, track_id)?,
        }),
        Query::Sequence { sequence_id } => Ok(Response::Sequence {
            revision,
            sequence: SequenceInfo::from(sequence(sequence_id)?),
            instances: query::sequence_instances(&document, sequence_id)?,
        }),
        Query::Clip {
            sequence_id,
            clip_id,
        } => Ok(Response::Clip {
            revision,
            clip: query::clip(&document, sequence_id, clip_id)?,
        }),
        Query::Clips {
            sequence_id,
            offset,
            limit,
        } => Ok(Response::Clips {
            page: query::clips(&document, sequence_id, offset, limit)?,
        }),
        Query::ClipHeaders {
            sequence_id,
            offset,
            limit,
        } => Ok(Response::ClipHeaders {
            page: query::clip_headers(&document, sequence_id, offset, limit)?,
        }),
        Query::Transitions {
            sequence_id,
            offset,
            limit,
        } => Ok(Response::Transitions {
            page: page(
                revision,
                &sequence(sequence_id)?.state.transitions,
                offset,
                limit,
            )?,
        }),
        Query::Definitions { offset, limit } => Ok(Response::Definitions {
            page: page(revision, &document.project.definitions, offset, limit)?,
        }),
        Query::Presets { offset, limit } => Ok(Response::Presets {
            page: query::presets(&document, offset, limit)?,
        }),
        Query::RecordingSuggestions {
            asset_id,
            offset,
            limit,
        } => {
            let asset = document
                .project
                .assets
                .iter()
                .find(|a| a.id == asset_id)
                .ok_or_else(|| EditorError::Invalid("missing source".into()))?;
            Ok(Response::RecordingSuggestions {
                page: page(revision, &asset.zooms, offset, limit)?,
            })
        }
        Query::Regions {
            sequence_id,
            start,
            end,
            offset,
            limit,
        } => {
            let regions = beam_editor_domain::commands::projections::regions(
                &document,
                sequence_id,
                start,
                end,
            )?;
            Ok(Response::Regions {
                page: page(revision, &regions, offset, limit)?,
            })
        }
        Query::ParameterValues {
            sequence_id,
            clip_id,
            time,
        } => Ok(Response::ParameterValues {
            values: beam_editor_domain::commands::projections::parameter_values(
                &document,
                sequence_id,
                clip_id,
                time,
            )?,
        }),
        Query::ScopedParameterValues { target, time } => Ok(Response::ScopedParameterValues {
            revision,
            target,
            time,
            values: beam_editor_domain::commands::projections::scoped_parameter_values(
                &document, target, time,
            )?,
        }),
    }
}
