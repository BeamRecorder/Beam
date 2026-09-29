//! Headless previews use their own graph and leave accepted transport untouched.
use crate::{
    EditorError, Project, Result,
    video::{
        pipeline,
        preview::{self, Frames},
        worker::PipelineGuard,
    },
};
use beam_editor_domain::{
    protocol::{ArtifactInfo, RenderQuality},
    timing::Time,
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
use uuid::Uuid;

pub fn render(
    root: &Path,
    project: &Project,
    id: Uuid,
    time: Time,
    quality: RenderQuality,
    cancel: &AtomicBool,
) -> Result<Option<ArtifactInfo>> {
    time.validate()?;
    if time.ticks < 0
        || i128::from(time.ticks) * 1000
            >= i128::from(project.duration_ms()) * i128::from(time.timescale)
    {
        return Err(EditorError::Invalid(
            "preview time is outside the sequence".into(),
        ));
    }
    let context = gst::glib::MainContext::new();
    context
        .with_thread_default(|| {
            if cancel.load(Ordering::Acquire) {
                return Ok(None);
            }
            let nanos = u64::try_from(time.ticks as i128 * 1_000_000_000 / time.timescale as i128)
                .map_err(|_| EditorError::Invalid("preview clock cannot be represented".into()))?;
            let position = nanos / 1_000_000;
            let pipeline = pipeline::build_preview(root, project, position)?;
            let _guard = PipelineGuard(pipeline.clone());
            let frames = Frames::default();
            *frames.quality.lock().unwrap_or_else(|p| p.into_inner()) = match quality {
                RenderQuality::Full => crate::video::types::PreviewQuality::Full,
                RenderQuality::Half => crate::video::types::PreviewQuality::Half,
                RenderQuality::Quarter => crate::video::types::PreviewQuality::Quarter,
            };
            preview::attach(&pipeline, &project.canvas, Arc::clone(&frames))?;
            pipeline
                .set_mode(ges::PipelineFlags::VIDEO_PREVIEW)
                .map_err(pipeline::media)?;
            frames.expect_position_rate(0, project.canvas.fps, project.canvas.fps_denominator);
            pipeline
                .set_state(gst::State::Paused)
                .map_err(pipeline::media)?;
            if !wait(&pipeline, &frames, cancel)? {
                return Ok(None);
            }
            frames.seek(
                &pipeline,
                gst::ClockTime::from_nseconds(nanos),
                project.canvas.fps,
                project.canvas.fps_denominator,
            )?;
            if !wait(&pipeline, &frames, cancel)? {
                return Ok(None);
            }
            let frame = frames
                .take()
                .ok_or_else(|| EditorError::Media("preview completed without a frame".into()))?;
            let artifact = super::artifacts::publish(
                root,
                id,
                "preview.png".into(),
                "image/png",
                frame.width,
                frame.height,
                |file| {
                    let mut encoder = png::Encoder::new(file, frame.width, frame.height);
                    encoder.set_color(png::ColorType::Rgba);
                    encoder.set_depth(png::BitDepth::Eight);
                    encoder
                        .write_header()
                        .and_then(|mut writer| writer.write_image_data(&frame.rgba))
                        .map_err(pipeline::media)
                },
            )?;
            Ok(Some(artifact))
        })
        .map_err(pipeline::media)?
}
fn wait(pipeline: &ges::Pipeline, frames: &Frames, cancel: &AtomicBool) -> Result<bool> {
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        if cancel.load(Ordering::Acquire) {
            return Ok(false);
        }
        let (state, _, _) = pipeline.state(gst::ClockTime::from_mseconds(50));
        state.map_err(pipeline::media)?;
        if frames.wait(Duration::from_millis(50)).is_ok() {
            return Ok(true);
        }
        if Instant::now() >= deadline {
            return Err(pipeline::media(
                "headless preview timed out waiting for its requested frame",
            ));
        }
    }
}
