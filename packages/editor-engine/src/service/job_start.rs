//! Durable acceptance precedes dispatch; replay precedes stale-context validation.
use super::{
    job_store::JobStore,
    job_types::{ACTIVE_JOB_BUDGET, JobOutput, JobRecord, JobWork},
};
use crate::{Document, EditorError, Project, Result};
use beam_editor_domain::{commands::source_jobs, protocol::*};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    sync::{Arc, atomic::AtomicBool},
};
use uuid::Uuid;

impl JobStore {
    pub fn start(
        self: &Arc<Self>,
        document: Document,
        context: RenderContext,
        kind: JobKind,
        output: JobOutput,
    ) -> Result<JobInfo> {
        let destination = match &output {
            JobOutput::Export(path) => Some(path.clone()),
            JobOutput::Preview => None,
        };
        let fingerprint = format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(&(&context, &kind, &destination))?)
        );
        self.accept(
            document.project.id,
            JobContext::Sequence {
                context: context.clone(),
            },
            kind.clone(),
            fingerprint,
            || {
                if !matches!(kind, JobKind::Export { .. } | JobKind::Preview { .. }) {
                    return Err(EditorError::Invalid(
                        "source jobs require a source context".into(),
                    ));
                }
                let project = super::job_snapshot::select(&document, &context, &kind)?;
                if destination
                    .as_ref()
                    .is_some_and(|path| path.symlink_metadata().is_ok())
                {
                    return Err(EditorError::Invalid(
                        "export destination already exists".into(),
                    ));
                }
                Ok(JobWork::Render { project, output })
            },
        )
    }
    pub fn start_source(
        self: &Arc<Self>,
        document: Document,
        context: SourceContext,
        kind: JobKind,
    ) -> Result<JobInfo> {
        let fingerprint = format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(&(&context, &kind))?)
        );
        self.accept(
            document.project.id,
            JobContext::Source {
                context: context.clone(),
            },
            kind.clone(),
            fingerprint,
            || {
                let asset = source_jobs::pin(&document, &context)?;
                match kind {
                    JobKind::Analysis { .. } => {
                        let mut project = Project::new(document.project.name.clone());
                        project.id = document.project.id;
                        project.assets.push(asset);
                        let mut frozen = Document::new(project.clone());
                        frozen.revision = document.revision;
                        Ok(JobWork::Analysis {
                            project,
                            document: Box::new(frozen),
                            context,
                        })
                    }
                    JobKind::Proxy { settings } => Ok(JobWork::Proxy {
                        project: source_jobs::proxy_project(&document, &context, &settings)?,
                    }),
                    _ => Err(EditorError::Invalid(
                        "render jobs require a sequence context".into(),
                    )),
                }
            },
        )
    }
    pub(super) fn accept(
        self: &Arc<Self>,
        project_id: Uuid,
        context: JobContext,
        kind: JobKind,
        fingerprint: String,
        prepare: impl FnOnce() -> Result<JobWork>,
    ) -> Result<JobInfo> {
        self.validate_project(project_id)?;
        let key = super::job_context::key(&context);
        if key.is_empty() || key.len() > 128 || key.contains('\0') {
            return Err(EditorError::Invalid(
                "job idempotency key requires 1–128 bytes without NUL".into(),
            ));
        }
        let mut state = self.state.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(record) = state
            .records
            .values()
            .find(|record| super::job_context::key(&record.context) == key)
        {
            return if record.fingerprint == fingerprint {
                Ok(record.info.clone())
            } else {
                Err(EditorError::Invalid(
                    "job idempotency key was reused with a different request".into(),
                ))
            };
        }
        if state
            .records
            .values()
            .filter(|record| matches!(record.info.phase, JobPhase::Queued | JobPhase::Rendering))
            .count()
            >= ACTIVE_JOB_BUDGET
        {
            return Err(EditorError::Invalid(
                "job workers are busy; retry after an active job completes".into(),
            ));
        }
        let work = prepare()?;
        let id = Uuid::new_v4();
        let info = JobInfo {
            id,
            project_id: super::job_context::project(&context),
            scope: super::job_context::scope(&context),
            revision: super::job_context::revision(&context),
            kind: kind.clone(),
            phase: JobPhase::Queued,
            progress: 0.,
            error: None,
            snapshot_id: None,
            source_versions: BTreeMap::new(),
            artifacts: vec![],
        };
        let record = JobRecord {
            info: info.clone(),
            context,
            fingerprint,
            artifacts: vec![],
            import_publication: None,
        };
        super::job_store::write(
            &super::artifacts::managed_directory(&self.root, "jobs")?,
            &record,
        )?;
        state.records.insert(id, record);
        let cancel = Arc::new(AtomicBool::new(false));
        state.cancellations.insert(id, cancel.clone());
        let store = self.clone();
        let thread = std::thread::Builder::new()
            .name(format!("beam-job-{id}"))
            .spawn(move || super::job_runner::run(store, id, work, kind, cancel));
        match thread {
            Ok(thread) => state.threads.push(thread),
            Err(error) => {
                state.cancellations.remove(&id);
                let record = state
                    .records
                    .get_mut(&id)
                    .ok_or_else(|| EditorError::Invalid("accepted job disappeared".into()))?;
                record.info.phase = JobPhase::Failed;
                record.info.error = Some(error.to_string());
                super::job_store::write(
                    &super::artifacts::managed_directory(&self.root, "jobs")?,
                    record,
                )?;
                return Err(crate::shared::storage("job worker", error));
            }
        }
        Ok(info)
    }
}
