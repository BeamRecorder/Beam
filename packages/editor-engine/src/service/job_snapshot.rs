//! Every render freezes one sequence and verifies the exact managed source bytes.
use crate::{Document, EditorError, Project, Result};
use beam_editor_domain::protocol::{JobKind, JobScope, RenderContext, SourceVersion};
use std::{collections::BTreeMap, path::Path, sync::atomic::AtomicBool};
use uuid::Uuid;
pub fn select(document: &Document, context: &RenderContext, kind: &JobKind) -> Result<Project> {
    if context.project_id != document.project.id {
        return Err(EditorError::Invalid(
            "render project does not match the accepted document".into(),
        ));
    }
    if context.expected_revision != document.revision {
        return Err(EditorError::Conflict {
            expected: context.expected_revision,
            actual: document.revision,
        });
    }
    let sequence = document
        .sequences
        .iter()
        .find(|sequence| sequence.id == context.sequence_id)
        .ok_or_else(|| EditorError::Invalid("render sequence was not found".into()))?;
    let mut project = document.project.clone();
    sequence.state.clone().restore(&mut project);
    let used: std::collections::HashSet<_> = project
        .clips
        .headers()
        .filter(|clip| clip.title.is_none() && clip.generator.is_none())
        .map(|clip| clip.asset_id)
        .collect();
    project.assets.retain(|asset| used.contains(&asset.id));
    if project.duration_ms() == 0 {
        return Err(EditorError::Invalid("add media before rendering".into()));
    }
    if let JobKind::Preview { time, .. } = kind {
        time.validate()?;
        if time.ticks < 0
            || time.ticks as i128 * 1000 >= project.duration_ms() as i128 * time.timescale as i128
        {
            return Err(EditorError::Invalid(
                "preview time is outside the sequence".into(),
            ));
        }
    }
    Ok(project)
}
pub fn sources(
    root: &Path,
    project: &Project,
    cancel: &AtomicBool,
) -> Result<BTreeMap<Uuid, SourceVersion>> {
    project
        .assets
        .iter()
        .map(|asset| {
            let version = super::artifacts::version_cancellable(
                &beam_editor_domain::project::validation::source_path(root, &asset.path)?,
                Some(cancel),
            )?;
            if asset.identity.as_ref().is_some_and(|identity| {
                identity.sha256 != version.sha256 || identity.byte_length != version.byte_length
            }) {
                return Err(EditorError::Invalid(format!(
                    "source bytes changed: {}",
                    asset.name
                )));
            }
            Ok((asset.id, version))
        })
        .collect()
}
pub fn pin(
    root: &Path,
    project: &Project,
    info: &beam_editor_domain::protocol::JobInfo,
) -> Result<String> {
    let mut snapshot = Document::new(project.clone());
    snapshot.revision = info.revision;
    snapshot.event_journal = Some(beam_editor_domain::commands::event_types::EventJournal {
        after_revision: info.revision,
        entries: vec![],
    });
    if let JobScope::Sequence { sequence_id } = info.scope {
        snapshot.active_sequence = sequence_id;
        snapshot.sequences[0].id = sequence_id;
    }
    super::super::project::sources::hydrate(root, &mut snapshot.project)?;
    beam_editor_domain::timeline::sequences::synchronize(&mut snapshot);
    beam_editor_domain::project::validation::document(&snapshot)?;
    beam_editor_domain::project::blocks::put(
        root,
        &beam_editor_domain::project::blocks::index(root, &snapshot)?,
    )
}
