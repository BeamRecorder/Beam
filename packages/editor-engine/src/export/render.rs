//! GES encodebin rendering with cancellation and atomic output publication.
use super::types::{Container, ExportPhase, ExportStatus};
use crate::video::pipeline::media;
use crate::{EditorError, Project, Result};
use ges::prelude::*;
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
    let pipeline = crate::video::pipeline::build(root, project)?;
    let guard = crate::video::worker::PipelineGuard(pipeline.clone());
    let profile = super::profile::build(
        container,
        encoder,
        crate::video::pipeline::has_audio(project),
    )?;
    pipeline
        .set_render_settings(&crate::video::probe::uri(temporary.path())?, &profile)
        .map_err(media)?;
    pipeline
        .set_mode(ges::PipelineFlags::RENDER)
        .map_err(media)?;
    super::gpu::attach(&pipeline, encoder)?;
    pipeline.set_state(gst::State::Playing).map_err(media)?;
    let bus = pipeline
        .bus()
        .ok_or_else(|| EditorError::Media("export has no message bus".into()))?;
    loop {
        if job.cancel.load(Ordering::Acquire) {
            return Ok(false);
        }
        if let Some(message) = bus.timed_pop(gst::ClockTime::from_mseconds(100)) {
            match message.view() {
                gst::MessageView::Eos(..) => break,
                gst::MessageView::Error(error) => {
                    return Err(media(format!(
                        "{} ({})",
                        error.error(),
                        error.debug().unwrap_or_default()
                    )));
                }
                _ => {}
            }
        }
        let current = pipeline
            .query_position::<gst::ClockTime>()
            .map_or(0, |t| t.mseconds());
        job.status
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .progress = (current as f64 / project.duration_ms() as f64).clamp(0., 0.99);
        let context = gst::glib::MainContext::thread_default()
            .ok_or_else(|| EditorError::Media("export has no owning context".into()))?;
        while context.pending() {
            context.iteration(false);
        }
    }
    drop(guard);
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
