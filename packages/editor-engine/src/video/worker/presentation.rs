//! Candidate preroll keeps the accepted frame available until publication.
use super::{PipelineGuard, ProjectStore};
use crate::{
    EditorError, Project, Result,
    video::{pipeline::media, preview::Frames},
};
use ges::prelude::GESPipelineExt;
use gst::prelude::*;
use std::{
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

pub(super) fn prepare(
    store: &ProjectStore,
    project: &Project,
    frames: Frames,
    position: u64,
) -> Result<Option<PipelineGuard>> {
    prepare_window(
        &store.root,
        project,
        frames,
        position,
        super::super::plan_types::PreviewWindow::default(),
        None,
    )
}
pub(super) fn prepare_window(
    root: &Path,
    project: &Project,
    frames: Frames,
    position: u64,
    policy: super::super::plan_types::PreviewWindow,
    cancel: Option<&AtomicBool>,
) -> Result<Option<PipelineGuard>> {
    if project.duration_ms() == 0 {
        return Ok(None);
    }
    cancelled(cancel)?;
    let pipeline =
        super::super::pipeline::build_preview_with_policy(root, project, position, policy)?;
    let guard = PipelineGuard(pipeline.clone());
    frames.expect_position_rate(0, project.canvas.fps, project.canvas.fps_denominator);
    super::super::preview::attach(&pipeline, &project.canvas, Arc::clone(&frames))?;
    if !super::super::pipeline::has_audio(project) {
        pipeline
            .set_mode(ges::PipelineFlags::VIDEO_PREVIEW)
            .map_err(media)?;
    }
    pipeline
        .set_state(gst::State::Paused)
        .map_err(|error| preview_error(&pipeline, error))?;
    wait(&pipeline, &frames, cancel)?;
    if position > 0 {
        frames.seek(
            &pipeline,
            gst::ClockTime::from_mseconds(position),
            project.canvas.fps,
            project.canvas.fps_denominator,
        )?;
        wait(&pipeline, &frames, cancel)?;
    }
    Ok(Some(guard))
}
fn cancelled(cancel: Option<&AtomicBool>) -> Result<()> {
    if cancel.is_some_and(|cancel| cancel.load(Ordering::Acquire)) {
        return Err(EditorError::Stopped);
    }
    Ok(())
}
fn wait(pipeline: &ges::Pipeline, frames: &Frames, cancel: Option<&AtomicBool>) -> Result<()> {
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        cancelled(cancel)?;
        let (result, _, _) = pipeline.state(gst::ClockTime::from_mseconds(50));
        result.map_err(|error| preview_error(pipeline, error))?;
        if frames.wait(Duration::from_millis(50)).is_ok() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(preview_error(
                pipeline,
                "preview preroll exceeded its time budget",
            ));
        }
    }
}
fn preview_error(pipeline: &ges::Pipeline, error: impl std::fmt::Display) -> EditorError {
    if let Some(bus) = pipeline.bus() {
        for message in bus.iter() {
            if let gst::MessageView::Error(failure) = message.view() {
                return media(format!(
                    "{} ({})",
                    failure.error(),
                    failure.debug().unwrap_or_default()
                ));
            }
        }
    }
    media(error)
}
pub(super) fn transfer(output: &Frames, pending: &Frames) {
    if let Some(frame) = pending.take() {
        output.publish(frame);
    }
}
