//! Source derivatives have their own immutable scope and never edit a montage.
use crate::{Document, EditorError, Project, Result};
use beam_editor_domain::{commands::source_jobs, protocol::*};
use std::{
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};
use uuid::Uuid;

pub fn analyze(
    root: &Path,
    document: &Document,
    context: &SourceContext,
    algorithm: AnalysisAlgorithm,
    id: Uuid,
    cancel: &AtomicBool,
) -> Result<Option<ArtifactInfo>> {
    if cancel.load(Ordering::Acquire) {
        return Ok(None);
    }
    let analysis = source_jobs::analyze(document, context, algorithm)?;
    if cancel.load(Ordering::Acquire) {
        return Ok(None);
    }
    super::artifacts::publish(
        root,
        id,
        "source-analysis.json".into(),
        "application/json",
        0,
        0,
        |file| {
            if cancel.load(Ordering::Acquire) {
                return Err(EditorError::Stopped);
            }
            serde_json::to_writer(file, &analysis)?;
            if cancel.load(Ordering::Acquire) {
                return Err(EditorError::Stopped);
            }
            Ok(())
        },
    )
    .map(Some)
}

pub fn proxy(
    root: &Path,
    project: &Project,
    settings: &ProxySettings,
    id: Uuid,
    cancel: &Arc<AtomicBool>,
    progress: impl FnMut(f64),
) -> Result<Option<ArtifactInfo>> {
    if cancel.load(Ordering::Acquire) {
        return Ok(None);
    }
    let folder = super::artifacts::managed_directory(root, "artifacts")?;
    let temporary = tempfile::Builder::new()
        .prefix(".proxy-")
        .tempdir_in(&folder)
        .map_err(|error| crate::shared::storage(&folder, error))?;
    let container = match settings.container {
        Container::Mp4 => crate::export::types::Container::Mp4,
        Container::Webm => crate::export::types::Container::Webm,
    };
    let file = temporary.path().join(match settings.container {
        Container::Mp4 => "proxy.mp4",
        Container::Webm => "proxy.webm",
    });
    let context = gst::glib::MainContext::new();
    let completed = context
        .with_thread_default(|| {
            crate::export::render::render_with_progress(
                root,
                project,
                &file,
                container,
                cancel.clone(),
                progress,
            )
        })
        .map_err(crate::video::pipeline::media)??;
    if !completed {
        return Ok(None);
    }
    let mime_type = match settings.container {
        Container::Mp4 => "video/mp4",
        Container::Webm => "video/webm",
    };
    super::artifacts::capture(
        root,
        id,
        &file,
        mime_type,
        project.canvas.width,
        project.canvas.height,
        cancel,
    )
    .map(Some)
}
