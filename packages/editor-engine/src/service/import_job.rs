//! An import candidate is durable before its short revision-checked actor publication.
use super::{import_job_types::ImportSource, job_store::JobStore};
use crate::{Document, EditorController, EditorError, Result};
use beam_editor_domain::{
    commands::{import_types::ImportPublication, imports},
    protocol::*,
};
use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use uuid::Uuid;

pub(crate) fn execute(
    store: &JobStore,
    id: Uuid,
    document: &Document,
    context: &RenderContext,
    sources: &[ImportSource],
    controller: &EditorController,
    cancel: &Arc<AtomicBool>,
) -> Result<Option<ArtifactInfo>> {
    if cancel.load(Ordering::Acquire) {
        return Ok(None);
    }
    let snapshot = super::job_snapshot::pin(&store.root, &document.project, &store.get(id)?)?;
    store.update(id, |record| {
        record.info.snapshot_id = Some(snapshot);
        record.info.phase = JobPhase::Rendering;
    })?;
    let total = sources.iter().try_fold(0u64, |size, source| {
        size.checked_add(source.stamp.length)
            .ok_or_else(|| EditorError::Invalid("import source size overflow".into()))
    })?;
    let mut copied = 0u64;
    let mut last = Instant::now();
    let mut assets = vec![];
    let mut files = crate::video::import_types::ImportedFiles {
        folder: store.root.join("media"),
        paths: vec![],
    };
    for source in sources {
        let metadata = source
            .path
            .symlink_metadata()
            .map_err(|error| crate::shared::storage(&source.path, error))?;
        if crate::project::source_types::SourceStamp::from(&metadata) != source.stamp
            || metadata.file_type().is_symlink()
        {
            return Err(EditorError::Invalid(
                "authorized source changed after the import job was accepted".into(),
            ));
        }
        let asset = crate::video::probe::import_cancellable(
            &store.root,
            &source.path,
            cancel,
            |bytes, _| {
                if last.elapsed() >= Duration::from_millis(250) {
                    last = Instant::now();
                    store.update(id, |record| {
                        record.info.progress = if total == 0 {
                            0.
                        } else {
                            (copied + bytes) as f64 / total as f64 * 0.9
                        }
                    })?;
                }
                Ok(())
            },
        )?;
        files.paths.push(store.root.join(&asset.path));
        copied += source.stamp.length;
        assets.push(asset);
    }
    if cancel.load(Ordering::Acquire) {
        return Ok(None);
    }
    let prepared = imports::prepare(document, context, assets)?;
    let versions = prepared
        .publication
        .asset_ids
        .iter()
        .map(|id| {
            let identity = prepared
                .document
                .project
                .assets
                .iter()
                .find(|asset| asset.id == *id)
                .and_then(|asset| asset.identity.as_ref())
                .ok_or_else(|| {
                    EditorError::Invalid("prepared import source version is missing".into())
                })?;
            Ok((
                *id,
                SourceVersion {
                    sha256: identity.sha256.clone(),
                    byte_length: identity.byte_length,
                },
            ))
        })
        .collect::<Result<BTreeMap<_, _>>>()?;
    store.update(id, |record| {
        record.info.source_versions = versions;
        record.info.progress = 0.95;
        record.import_publication = Some(prepared.publication.clone());
    })?;
    let replay = prepared.replay;
    let publication = controller.publish_import(
        store.root.clone(),
        context.clone(),
        prepared,
        cancel.clone(),
    )?;
    if !replay {
        files.paths.clear();
    }
    // Cancellation after the atomic publication cannot erase accepted sources or its result.
    publication_artifact(store, id, &publication).map(Some)
}
fn publication_artifact(
    store: &JobStore,
    id: Uuid,
    publication: &ImportPublication,
) -> Result<ArtifactInfo> {
    let bytes = serde_json::to_vec(publication)?;
    super::artifacts::publish(
        &store.root,
        id,
        "import-publication.json".into(),
        "application/json",
        0,
        0,
        |file| {
            file.write_all(&bytes)
                .map_err(|error| crate::shared::storage("import publication artifact", error))
        },
    )
}

impl JobStore {
    /// The candidate must exactly match a durable accepted publication, never merely its key.
    pub(crate) fn recover_imports(&self, document: &Document) -> Result<()> {
        let recoverable = {
            let state = self.state.lock().unwrap_or_else(|p| p.into_inner());
            state
                .records
                .values()
                .filter(|record| {
                    record.info.phase == JobPhase::Failed
                        && matches!(record.info.kind, JobKind::Import { .. })
                })
                .filter_map(|record| {
                    record
                        .import_publication
                        .as_ref()
                        .filter(|publication| document.import_publications.contains(publication))
                        .map(|publication| (record.info.id, publication.clone()))
                })
                .collect::<Vec<_>>()
        };
        for (id, publication) in recoverable {
            let artifact = publication_artifact(self, id, &publication)?;
            if let Err(error) = self.update(id, |record| {
                record.info.phase = JobPhase::Completed;
                record.info.progress = 1.;
                record.info.error = None;
                record.info.artifacts = vec![artifact.id];
                record.artifacts = vec![artifact.clone()];
            }) {
                let path = super::artifacts::managed_directory(&self.root, "artifacts")?
                    .join(format!("{}.bin", artifact.id));
                if let Err(failure) = fs::remove_file(&path) {
                    eprintln!("unpublished import recovery artifact cleanup failed: {failure}");
                }
                return Err(error);
            }
        }
        Ok(())
    }
}
