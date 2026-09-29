//! GES encodebin rendering with cancellation and atomic output publication.
use super::types::{Container, ExportPhase, ExportStatus};
use crate::video::pipeline::media;
use crate::{EditorError, Project, Result};
use std::{
    fs::File,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};

#[derive(Clone, Default)]
pub struct Exporter {
    status: Arc<Mutex<ExportStatus>>,
    cancel: Arc<AtomicBool>,
    thread: Arc<Mutex<Option<std::thread::JoinHandle<()>>>>,
}
impl Exporter {
    /// Returns cheap export progress without constructing a project snapshot.
    pub fn status(&self) -> ExportStatus {
        self.status
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }
    /// Cancels the current render. Partial output is never published as a complete file.
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::Release);
    }
    /// Waits for GPU resource teardown after cancellation or completion.
    pub fn join(&self) {
        if let Some(thread) = self.thread.lock().unwrap_or_else(|p| p.into_inner()).take() {
            let _ = thread.join();
        }
    }
    /// Starts an immutable job after checking that no export is already active.
    pub fn start(
        &self,
        root: PathBuf,
        project: Project,
        destination: PathBuf,
        container: Container,
    ) -> Result<()> {
        let mut status = self.status.lock().unwrap_or_else(|p| p.into_inner());
        if status.phase == ExportPhase::Rendering {
            return Err(EditorError::Invalid("an export is already running".into()));
        }
        if project.duration_ms() == 0 {
            return Err(EditorError::Invalid("add media before exporting".into()));
        }
        self.join();
        self.cancel.store(false, Ordering::Release);
        *status = ExportStatus {
            phase: ExportPhase::Rendering,
            progress: 0.,
            error: None,
        };
        let job = self.clone();
        let error_path = destination.clone();
        let thread = std::thread::Builder::new()
            .name("beam-editor-export".into())
            .spawn(move || {
                let context = gst::glib::MainContext::new();
                let result = context
                    .with_thread_default(|| render(&root, &project, &destination, container, &job));
                let result = result.map_err(media).and_then(|r| r);
                let mut status = job.status.lock().unwrap_or_else(|p| p.into_inner());
                match result {
                    Ok(true) => {
                        status.phase = ExportPhase::Completed;
                        status.progress = 1.;
                    }
                    Ok(false) => status.phase = ExportPhase::Cancelled,
                    Err(EditorError::Stopped) if job.cancel.load(Ordering::Acquire) => {
                        status.phase = ExportPhase::Cancelled
                    }
                    Err(error) => {
                        status.phase = ExportPhase::Failed;
                        status.error = Some(error.to_string());
                    }
                }
            })
            .map_err(|e| {
                status.phase = ExportPhase::Failed;
                crate::shared::storage(&error_path, e)
            })?;
        *self.thread.lock().unwrap_or_else(|p| p.into_inner()) = Some(thread);
        Ok(())
    }
}

/// Renders on the owning GES thread; returns false on user cancellation.
pub fn render(
    root: &Path,
    project: &Project,
    destination: &Path,
    container: Container,
    job: &Exporter,
) -> Result<bool> {
    render_with_progress(
        root,
        project,
        destination,
        container,
        job.cancel.clone(),
        |progress| {
            job.status
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .progress = progress;
        },
    )
}
/// The same renderer reports durable job progress without touching playback state.
pub fn render_with_progress(
    root: &Path,
    project: &Project,
    destination: &Path,
    container: Container,
    cancel: Arc<AtomicBool>,
    mut progress: impl FnMut(f64),
) -> Result<bool> {
    if cancel.load(Ordering::Acquire) {
        return Ok(false);
    }
    if project.duration_ms() == 0 {
        return Err(EditorError::Invalid("add media before exporting".into()));
    }
    let versions = crate::service::job_snapshot::sources(root, project, &cancel)?;
    if destination.exists() {
        return Err(EditorError::Invalid(
            "choose a new export filename; existing files are preserved".into(),
        ));
    }
    let parent = destination
        .parent()
        .filter(|p| p.is_dir())
        .ok_or_else(|| EditorError::Invalid("export directory is missing".into()))?;
    let temporary = tempfile::Builder::new()
        .prefix(".beam-export-")
        .suffix(&format!(".{}", container.extension()))
        .tempfile_in(parent)
        .map_err(|e| crate::shared::storage(parent, e))?;
    let encoder = super::profile::hardware(container)?;
    if !super::segments::render(
        root,
        project,
        temporary.path(),
        container,
        encoder,
        cancel.clone(),
        |position_ms| {
            progress((position_ms as f64 / project.duration_ms() as f64).clamp(0., 0.99));
        },
    )? {
        return Ok(false);
    }
    if cancel.load(Ordering::Acquire) {
        return Ok(false);
    }
    if crate::service::job_snapshot::sources(root, project, &cancel)? != versions {
        return Err(EditorError::Invalid(
            "source bytes changed before export publication".into(),
        ));
    }
    File::open(temporary.path())
        .and_then(|file| file.sync_all())
        .map_err(|e| crate::shared::storage(temporary.path(), e))?;
    temporary
        .persist_noclobber(destination)
        .map_err(|e| crate::shared::storage(destination, e.error))?;
    // Directory synchronization is unsupported on some Windows filesystems.
    if let Err(error) = File::open(parent).and_then(|dir| dir.sync_all())
        && !matches!(
            error.kind(),
            std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::InvalidInput
        )
    {
        return Err(crate::shared::storage(parent, error));
    }
    Ok(true)
}
