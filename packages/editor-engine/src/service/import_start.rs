//! Accept import work immediately; copying and probing never run on the media actor.
use super::{import_job_types::ImportSource, job_store::JobStore, job_types::JobWork};
use crate::{Document, EditorController, EditorError, Result};
use beam_editor_domain::{
    commands::imports,
    protocol::{JobContext, JobInfo, JobKind, RenderContext},
};
use sha2::{Digest, Sha256};
use std::{path::PathBuf, sync::Arc};

impl JobStore {
    pub fn start_import(
        self: &Arc<Self>,
        document: Document,
        context: RenderContext,
        paths: Vec<PathBuf>,
        controller: Arc<EditorController>,
    ) -> Result<JobInfo> {
        if paths.is_empty() || paths.len() > imports::IMPORT_SOURCE_LIMIT {
            return Err(EditorError::Invalid(
                "select 1–32 authorized media sources".into(),
            ));
        }
        let sources = paths
            .into_iter()
            .map(|path| {
                let metadata = path
                    .symlink_metadata()
                    .map_err(|error| crate::shared::storage(&path, error))?;
                if !metadata.is_file() || metadata.file_type().is_symlink() {
                    return Err(EditorError::Invalid(
                        "import source is not a regular authorized file".into(),
                    ));
                }
                Ok(ImportSource {
                    path,
                    stamp: crate::project::source_types::SourceStamp::from(&metadata),
                })
            })
            .collect::<Result<Vec<_>>>()?;
        let fingerprint = format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(&(&context, &sources))?)
        );
        let kind = JobKind::Import {
            source_count: sources.len(),
        };
        self.accept(
            document.project.id,
            JobContext::Sequence {
                context: context.clone(),
            },
            kind,
            fingerprint,
            || {
                if context.project_id != document.project.id {
                    return Err(EditorError::Invalid(
                        "import project differs from the accepted owner".into(),
                    ));
                }
                let replay = document
                    .import_publications
                    .iter()
                    .any(|publication| publication.idempotency_key == context.idempotency_key);
                if !replay && context.expected_revision != document.revision {
                    return Err(EditorError::Conflict {
                        expected: context.expected_revision,
                        actual: document.revision,
                    });
                }
                if !document
                    .sequences
                    .iter()
                    .any(|sequence| sequence.id == context.sequence_id)
                {
                    return Err(EditorError::Invalid("import sequence was not found".into()));
                }
                if document
                    .receipts
                    .iter()
                    .any(|receipt| receipt.idempotency_key == context.idempotency_key)
                {
                    return Err(EditorError::Invalid(
                        "import idempotency key already belongs to an edit".into(),
                    ));
                }
                Ok(JobWork::Import {
                    document: Box::new(document),
                    context,
                    sources,
                    controller,
                })
            },
        )
    }
}
