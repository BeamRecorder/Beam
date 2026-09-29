//! Preview sources are acquired by playback interval, independent from document size.
use super::{
    Worker, no_project, prepare, transfer,
    window_types::{WindowPhase, WindowTask},
};
use crate::{
    Result,
    video::{pipeline, preview::Frames},
};
use ges::prelude::GESPipelineExt;
use gst::prelude::*;
use std::{
    sync::Arc,
    time::{Duration, Instant},
};

impl Worker {
    pub(super) fn ensure_window(&mut self, position: u64) -> Result<bool> {
        self.cancel_preload();
        self.replace_window(position)
    }
    fn replace_window(&mut self, position: u64) -> Result<bool> {
        if self
            .pipeline
            .as_ref()
            .is_none_or(|p| pipeline::contains_position(&p.0, position))
        {
            return Ok(false);
        }
        let store = self.store.as_ref().ok_or_else(no_project)?;
        let project = &self.document.as_ref().ok_or_else(no_project)?.project;
        let pending = Frames::default();
        *pending.quality.lock().unwrap_or_else(|p| p.into_inner()) = *self
            .frames
            .quality
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        *pending.transport.lock().unwrap_or_else(|p| p.into_inner()) = *self
            .frames
            .transport
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let candidate = prepare(store, project, Arc::clone(&pending), position)?;
        if self.playing
            && let Some(pipeline) = &candidate
        {
            if let Err(error) = pipeline.0.set_state(gst::State::Playing) {
                return Err(pipeline::media(error));
            }
            pending.resume();
        }
        self.pipeline = candidate;
        self.pipeline_frames = pending;
        self.position = position;
        transfer(&self.frames, &self.pipeline_frames);
        self.pipeline_frames.forward_to(&self.frames);
        Ok(true)
    }
    pub(super) fn cancel_preload(&mut self) {
        if let Some(task) = &mut self.preload_task {
            task.cancelled = true;
        }
    }
    /// Each actor tick advances preroll once, leaving commands and accepted frames available.
    pub(super) fn preload(&mut self) {
        if let Err(error) = self.advance_preload() {
            self.preload_task = None;
            self.error = Some(error.to_string());
            let _ = self.play(false);
        }
        if !self.playing || self.preload_task.is_some() {
            return;
        }
        let position = self
            .pipeline
            .as_ref()
            .and_then(|pipeline| pipeline.0.query_position::<gst::ClockTime>())
            .map_or(self.position, |time| time.mseconds());
        if self
            .pipeline
            .as_ref()
            .is_none_or(|pipeline| pipeline::contains_position(&pipeline.0, position))
        {
            return;
        }
        if let Err(error) = self.start_preload(position) {
            self.error = Some(error.to_string());
            let _ = self.play(false);
        }
    }
    fn advance_preload(&mut self) -> Result<()> {
        let Some(task) = &mut self.preload_task else {
            return Ok(());
        };
        let (state, _, _) = task.pipeline.0.state(gst::ClockTime::ZERO);
        state.map_err(pipeline::media)?;
        if task.started.elapsed() > Duration::from_secs(30) {
            return Err(pipeline::media(
                "preview preparation exceeded its time budget",
            ));
        }
        if task.frames.wait(Duration::ZERO).is_err() {
            return Ok(());
        }
        if task.cancelled {
            self.preload_task = None;
            return Ok(());
        }
        if matches!(task.phase, WindowPhase::Preroll) && task.position > 0 {
            let canvas = &self
                .document
                .as_ref()
                .ok_or_else(no_project)?
                .project
                .canvas;
            task.frames.seek(
                &task.pipeline.0,
                gst::ClockTime::from_mseconds(task.position),
                canvas.fps,
                canvas.fps_denominator,
            )?;
            task.phase = WindowPhase::Seek;
            return Ok(());
        }
        let prepared = self
            .preload_task
            .take()
            .ok_or_else(|| pipeline::media("preview preparation disappeared"))?;
        let current = self.document.as_ref().is_some_and(|document| {
            document.revision == prepared.revision && document.active_sequence == prepared.sequence
        });
        if current && self.playing {
            self.preview_window = policy(prepared.started.elapsed());
            self.publish_preloaded(prepared)?;
        }
        Ok(())
    }
    fn start_preload(&mut self, position: u64) -> Result<()> {
        let root = &self.store.as_ref().ok_or_else(no_project)?.root;
        let document = self.document.as_ref().ok_or_else(no_project)?;
        let frames = Frames::default();
        *frames.quality.lock().unwrap_or_else(|p| p.into_inner()) = *self
            .frames
            .quality
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        *frames.transport.lock().unwrap_or_else(|p| p.into_inner()) = *self
            .frames
            .transport
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let started = Instant::now();
        let candidate = pipeline::build_preview_with_policy(
            root,
            &document.project,
            position,
            self.preview_window,
        )?;
        let guard = super::PipelineGuard(candidate.clone());
        frames.expect_position_rate(
            0,
            document.project.canvas.fps,
            document.project.canvas.fps_denominator,
        );
        super::super::preview::attach(&candidate, &document.project.canvas, frames.clone())?;
        if !pipeline::has_audio(&document.project) {
            candidate
                .set_mode(ges::PipelineFlags::VIDEO_PREVIEW)
                .map_err(pipeline::media)?;
        }
        candidate
            .set_state(gst::State::Paused)
            .map_err(pipeline::media)?;
        self.preload_task = Some(WindowTask {
            pipeline: guard,
            frames,
            revision: document.revision,
            sequence: document.active_sequence,
            position,
            cancelled: false,
            phase: WindowPhase::Preroll,
            started,
        });
        Ok(())
    }
    fn publish_preloaded(&mut self, prepared: WindowTask) -> Result<()> {
        let candidate = Some(prepared.pipeline);
        let Some(accepted) = &self.pipeline else {
            return Ok(());
        };
        accepted
            .0
            .set_state(gst::State::Paused)
            .map_err(pipeline::media)?;
        let position = accepted
            .0
            .query_position::<gst::ClockTime>()
            .map_or(self.position, |time| time.mseconds());
        let result = (|| {
            if let Some(candidate) = &candidate {
                if !pipeline::contains_position(&candidate.0, position) {
                    return Err(pipeline::media(
                        "playback exceeded its prepared preview window",
                    ));
                }
                let canvas = &self
                    .document
                    .as_ref()
                    .ok_or_else(no_project)?
                    .project
                    .canvas;
                prepared.frames.seek(
                    &candidate.0,
                    gst::ClockTime::from_mseconds(position),
                    canvas.fps,
                    canvas.fps_denominator,
                )?;
                prepared.frames.wait(Duration::from_secs(10))?;
                candidate
                    .0
                    .set_state(gst::State::Playing)
                    .map_err(pipeline::media)?;
                prepared.frames.resume();
            }
            Ok(())
        })();
        if let Err(error) = result {
            accepted
                .0
                .set_state(gst::State::Playing)
                .map_err(pipeline::media)?;
            return Err(error);
        }
        self.pipeline = candidate;
        self.pipeline_frames = prepared.frames;
        self.position = position;
        transfer(&self.frames, &self.pipeline_frames);
        self.pipeline_frames.forward_to(&self.frames);
        Ok(())
    }
}
fn policy(preroll: Duration) -> super::super::plan_types::PreviewWindow {
    let measured = u64::try_from(preroll.as_millis()).unwrap_or(u64::MAX);
    let margin = measured
        .saturating_mul(3)
        .div_ceil(2)
        .saturating_add(2000)
        .max(super::super::plan_types::RELOAD_MARGIN_MS);
    super::super::plan_types::PreviewWindow {
        behind_ms: super::super::plan_types::LOOK_BEHIND_MS.max(margin.saturating_add(2000)),
        ahead_ms: margin.saturating_add(20_000),
        reload_margin_ms: margin,
    }
}
