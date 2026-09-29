//! Source publications share the actor's atomic document and render commit.
use super::{Worker, no_project};
use crate::{EditorError, Result};
use beam_editor_domain::{
    commands::{assets, import_types::ImportPublication, imports, types::Receipt},
    project::types::SourceIdentity,
    protocol::RenderContext,
};
use std::path::PathBuf;
use uuid::Uuid;

impl Worker {
    pub(super) fn publish_import(
        &mut self,
        root: PathBuf,
        context: RenderContext,
        prepared: beam_editor_domain::commands::import_types::PreparedImport,
        cancel: &std::sync::atomic::AtomicBool,
    ) -> Result<ImportPublication> {
        let document = self.document.as_ref().ok_or_else(no_project)?;
        if self.store.as_ref().ok_or_else(no_project)?.root != root
            || document.project.id != context.project_id
        {
            return Err(EditorError::Invalid(
                "import owner changed while media was being prepared".into(),
            ));
        }
        if prepared.publication.project_id != context.project_id
            || prepared.publication.sequence_id != context.sequence_id
            || prepared.publication.idempotency_key != context.idempotency_key
        {
            return Err(EditorError::Invalid(
                "prepared import does not match its accepted job context".into(),
            ));
        }
        if prepared.replay {
            return document
                .import_publications
                .iter()
                .find(|publication| **publication == prepared.publication)
                .cloned()
                .ok_or_else(|| {
                    EditorError::Invalid(
                        "import publication no longer matches the accepted owner".into(),
                    )
                });
        }
        if document.revision != context.expected_revision {
            return Err(EditorError::Conflict {
                expected: context.expected_revision,
                actual: document.revision,
            });
        }
        if prepared.document.project.id != document.project.id
            || context.expected_revision.checked_add(1) != Some(prepared.document.revision)
            || prepared.document.revision != prepared.publication.revision
        {
            return Err(EditorError::Invalid(
                "prepared import revision is inconsistent".into(),
            ));
        }
        if cancel.load(std::sync::atomic::Ordering::Acquire) {
            return Err(EditorError::Stopped);
        }
        self.commit(prepared.document)?;
        Ok(prepared.publication)
    }
    pub(super) fn import_publication(
        &mut self,
        context: RenderContext,
        paths: Vec<PathBuf>,
    ) -> Result<ImportPublication> {
        if paths.is_empty() || paths.len() > imports::IMPORT_SOURCE_LIMIT {
            return Err(EditorError::Invalid("select 1–32 media files".into()));
        }
        let document = self.document.as_ref().ok_or_else(no_project)?;
        let root = self.store.as_ref().ok_or_else(no_project)?.root.clone();
        let identities = paths
            .iter()
            .map(|path| crate::project::sources::identity(path))
            .collect::<Result<Vec<_>>>()?;
        if let Some(publication) = imports::replay(document, &context, &identities)? {
            return Ok(publication);
        }
        let mut imported = super::super::import_types::ImportedFiles {
            folder: root.join("media"),
            paths: vec![],
        };
        let mut assets = Vec::with_capacity(paths.len());
        for (path, identity) in paths.into_iter().zip(identities) {
            let asset = super::super::probe::import(&root, &path)?;
            imported.paths.push(root.join(&asset.path));
            if asset.identity.as_ref() != Some(&identity) {
                return Err(EditorError::Invalid(
                    "source changed before its managed publication".into(),
                ));
            }
            assets.push(asset);
        }
        let prepared = imports::prepare(document, &context, assets)?;
        self.commit(prepared.document)?;
        imported.paths.clear();
        Ok(prepared.publication)
    }
    pub(super) fn relink(
        &mut self,
        context: RenderContext,
        previous: Uuid,
        clips: Vec<Uuid>,
        source: PathBuf,
    ) -> Result<Receipt> {
        let document = self.document.as_ref().ok_or_else(no_project)?;
        let root = self.store.as_ref().ok_or_else(no_project)?.root.clone();
        let verified = crate::service::artifacts::version(&source)?;
        let identity = SourceIdentity {
            sha256: verified.sha256,
            byte_length: verified.byte_length,
        };
        if let Some(receipt) =
            assets::replay_relink(document, &context, previous, &clips, &identity)?
        {
            return Ok(receipt);
        }
        let asset = super::super::probe::import(&root, &source)?;
        let mut imported = super::super::import_types::ImportedFiles {
            folder: root.join("media"),
            paths: vec![root.join(&asset.path)],
        };
        if asset.identity.as_ref() != Some(&identity) {
            return Err(EditorError::Invalid(
                "source changed before its managed publication".into(),
            ));
        }
        let prepared = assets::prepare_relink(document, &context, previous, &clips, asset)?;
        self.commit(prepared.document)?;
        imported.paths.clear();
        Ok(prepared.receipt)
    }
}
