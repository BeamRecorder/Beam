//! Reuses a paused, source-only GPU pipeline for sparse timestamp seeks.
use super::types::Source;
use crate::video::{pipeline::media, preview::Frames, worker::PipelineGuard};
use crate::{Clip, Effects, PreviewFrame, Project, Result};
use ges::prelude::*;
use std::{sync::Arc, time::Duration};

pub(super) use super::types::VideoDecoder as Decoder;

impl Decoder {
    pub(super) fn new(source: &Source) -> Result<Self> {
        let asset = &source.asset;
        let factor = 256. / asset.width.max(asset.height).max(1) as f64;
        let mut project = Project::new("Source artwork".into());
        project.canvas.width = (asset.width as f64 * factor).round().max(16.) as u32;
        project.canvas.height = (asset.height as f64 * factor).round().max(16.) as u32;
        let mut video = asset.clone();
        video.has_audio = false;
        project.assets.push(video);
        project.clips.push(Clip {
            id: uuid::Uuid::new_v4(),
            asset_id: asset.id,
            track_id: project.tracks[0].id,
            start_ms: 0,
            source_in_ms: 0,
            duration_ms: asset.duration_ms,
            effects: Effects {
                auto_zoom: false,
                ..Effects::default()
            },
            title: None,
        });
        let frames = Frames::default();
        let pipeline = crate::video::pipeline::build(&source.root, &project)?;
        let guard = PipelineGuard(pipeline.clone());
        crate::video::preview::attach(&pipeline, &project.canvas, Arc::clone(&frames))?;
        pipeline
            .set_mode(ges::PipelineFlags::VIDEO_PREVIEW)
            .map_err(media)?;
        pipeline.set_state(gst::State::Paused).map_err(media)?;
        pipeline
            .state(gst::ClockTime::from_seconds(5))
            .0
            .map_err(media)?;
        frames.wait(Duration::from_secs(5))?;
        Ok(Self {
            pipeline: guard,
            frames,
        })
    }
    pub(super) fn frame(&self, position_ms: u64) -> Result<PreviewFrame> {
        self.frames.expect_position(position_ms, 30);
        self.pipeline
            .0
            .seek_simple(
                gst::SeekFlags::FLUSH | gst::SeekFlags::ACCURATE,
                gst::ClockTime::from_mseconds(position_ms),
            )
            .map_err(media)?;
        self.frames.wait(Duration::from_secs(5))?;
        self.frames
            .take()
            .ok_or_else(|| media("source decoder returned no frame"))
    }
}
