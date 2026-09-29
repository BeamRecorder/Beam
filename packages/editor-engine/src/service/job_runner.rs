//! Terminal states are persisted by workers, independently from client polling.
use super::{
    job_store::JobStore,
    job_types::{JobOutput, JobWork},
};
use crate::{EditorError, Result};
use beam_editor_domain::protocol::*;
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use uuid::Uuid;

pub(crate) fn run(
    store: Arc<JobStore>,
    id: Uuid,
    work: JobWork,
    kind: JobKind,
    cancel: Arc<AtomicBool>,
) {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        render(&store, id, &work, kind, &cancel)
    }))
    .unwrap_or_else(|_| Err(EditorError::Media("render worker panicked".into())));
    let unpublished = result.as_ref().ok().and_then(|artifact| artifact.clone());
    let outcome = store.update(id, |record| match result {
        Ok(Some(artifact)) => {
            record.info.phase = JobPhase::Completed;
            record.info.progress = 1.;
            record.info.artifacts = vec![artifact.id];
            record.artifacts = vec![artifact];
        }
        Ok(None) => record.info.phase = JobPhase::Cancelled,
        Err(error) => {
            let cancelled = matches!(error, EditorError::Stopped) && cancel.load(Ordering::Acquire);
            record.info.phase = if cancelled {
                JobPhase::Cancelled
            } else {
                JobPhase::Failed
            };
            record.info.error = (!cancelled).then(|| error.to_string());
        }
    });
    if let Err(error) = outcome {
        eprintln!("job {id} metadata could not be persisted: {error}");
        if let Some(artifact) = unpublished
            && let Err(failure) = discard(&store, &artifact)
        {
            eprintln!("job {id} unpublished artifact cleanup failed: {failure}");
        }
    }
    store
        .state
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .cancellations
        .remove(&id);
}
fn render(
    store: &JobStore,
    id: Uuid,
    work: &JobWork,
    kind: JobKind,
    cancel: &Arc<AtomicBool>,
) -> Result<Option<ArtifactInfo>> {
    if cancel.load(Ordering::Acquire) {
        return Ok(None);
    }
    if let (
        JobKind::Import { .. },
        JobWork::Import {
            document,
            context,
            sources,
            controller,
        },
    ) = (&kind, work)
    {
        return super::import_job::execute(
            store, id, document, context, sources, controller, cancel,
        );
    }
    let project = work.project();
    let versions = super::job_snapshot::sources(&store.root, project, cancel)?;
    let snapshot = super::job_snapshot::pin(&store.root, project, &store.get(id)?)?;
    store.update(id, |record| {
        record.info.snapshot_id = Some(snapshot);
        record.info.source_versions = versions.clone();
        record.info.phase = JobPhase::Rendering;
    })?;
    let artifact = match (kind, work) {
        (
            JobKind::Preview { time, quality },
            JobWork::Render {
                output: JobOutput::Preview,
                ..
            },
        ) => super::preview_render::render(&store.root, project, id, time, quality, cancel)?,
        (
            JobKind::Export { container },
            JobWork::Render {
                output: JobOutput::Export(destination),
                ..
            },
        ) => {
            let mut last = Instant::now();
            let mut progress_error = None;
            let context = gst::glib::MainContext::new();
            let completed = context
                .with_thread_default(|| {
                    crate::export::render::render_with_progress(
                        &store.root,
                        project,
                        destination,
                        match container {
                            Container::Mp4 => crate::export::types::Container::Mp4,
                            Container::Webm => crate::export::types::Container::Webm,
                        },
                        cancel.clone(),
                        |progress| {
                            if last.elapsed() >= Duration::from_millis(250) {
                                last = Instant::now();
                                if let Err(error) =
                                    store.update(id, |record| record.info.progress = progress)
                                {
                                    progress_error = Some(error);
                                    cancel.store(true, Ordering::Release);
                                }
                            }
                        },
                    )
                })
                .map_err(crate::video::pipeline::media)??;
            if let Some(error) = progress_error {
                return Err(error);
            }
            if !completed {
                return Ok(None);
            }
            Some(super::artifacts::capture(
                &store.root,
                id,
                destination,
                match container {
                    Container::Mp4 => "video/mp4",
                    Container::Webm => "video/webm",
                },
                project.canvas.width,
                project.canvas.height,
                cancel,
            )?)
        }
        (
            JobKind::Analysis { algorithm },
            JobWork::Analysis {
                document, context, ..
            },
        ) => super::source_render::analyze(&store.root, document, context, algorithm, id, cancel)?,
        (JobKind::Proxy { settings }, JobWork::Proxy { .. }) => {
            let mut last = Instant::now();
            let mut progress_error = None;
            let artifact = super::source_render::proxy(
                &store.root,
                project,
                &settings,
                id,
                cancel,
                |progress| {
                    if last.elapsed() >= Duration::from_millis(250) {
                        last = Instant::now();
                        if let Err(error) =
                            store.update(id, |record| record.info.progress = progress)
                        {
                            progress_error = Some(error);
                            cancel.store(true, Ordering::Release);
                        }
                    }
                },
            )?;
            if let Some(error) = progress_error {
                if let Some(artifact) = &artifact {
                    discard(store, artifact)?;
                }
                return Err(error);
            }
            artifact
        }
        _ => {
            return Err(EditorError::Invalid(
                "render job output does not match its kind".into(),
            ));
        }
    };
    let verified = super::job_snapshot::sources(&store.root, project, cancel);
    if verified.as_ref().is_err() || verified.as_ref().is_ok_and(|value| *value != versions) {
        if let Some(artifact) = &artifact {
            discard(store, artifact)?;
        }
        verified?;
        return Err(EditorError::Invalid(
            "source versions changed during the render".into(),
        ));
    }
    Ok(artifact)
}
fn discard(store: &JobStore, artifact: &ArtifactInfo) -> Result<()> {
    let path = super::artifacts::managed_directory(&store.root, "artifacts")?
        .join(format!("{}.bin", artifact.id));
    std::fs::remove_file(&path).map_err(|error| crate::shared::storage(path, error))
}
