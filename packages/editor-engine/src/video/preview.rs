//! Bounded RGBA preview publication and source-time GStreamer camera bindings.
use super::pipeline::media;
use crate::{Canvas, Clip, EditorError, MediaAsset, PreviewFrame, Result};
use ges::prelude::*;
use gst_video::VideoFrameExt;
use std::{
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

pub type Frames = Arc<super::types::FrameMailbox>;

impl super::types::FrameMailbox {
    pub fn take(&self) -> Option<PreviewFrame> {
        self.pending
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .frame
            .take()
    }
    pub fn clear(&self) {
        let mut slot = self.pending.lock().unwrap_or_else(|p| p.into_inner());
        slot.frame = None;
        slot.ready = false;
    }
    /// Bind only after a candidate timeline is persisted; streaming then wakes
    /// the native viewport directly, without a 30 Hz actor or JSON polling gate.
    pub fn forward_to(&self, target: &Frames) {
        *self.forward.lock().unwrap_or_else(|p| p.into_inner()) = Arc::downgrade(target);
    }
    /// Rejects prerolls left over from a previous seek, including backward seeks.
    pub fn expect_position(&self, time: u64, fps: u32) {
        let mut slot = self.pending.lock().unwrap_or_else(|p| p.into_inner());
        slot.frame = None;
        slot.ready = false;
        slot.window = Some((
            time.saturating_sub(1),
            time.saturating_add(1000_u64.div_ceil(fps.max(1) as u64)),
        ));
    }
    pub fn resume(&self) {
        self.pending
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .window = None;
    }
    pub fn publish(&self, frame: PreviewFrame) {
        let consumer = self
            .consumer
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone();
        if let Some(consume) = consumer {
            consume(frame);
            return;
        }
        let mut slot = self.pending.lock().unwrap_or_else(|p| p.into_inner());
        if slot
            .window
            .is_some_and(|(start, end)| frame.position_ms < start || frame.position_ms > end)
        {
            return;
        }
        slot.ready = true;
        let target = self
            .forward
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .upgrade();
        if let Some(target) = target {
            drop(slot);
            target.publish(frame);
        } else {
            slot.frame = Some(frame);
        }
        self.ready.notify_all();
    }
    /// The streaming callback, rather than a UI timer, completes a paused seek.
    pub fn wait(&self, timeout: Duration) -> Result<()> {
        let pending = self.pending.lock().unwrap_or_else(|p| p.into_inner());
        let (pending, _) = self
            .ready
            .wait_timeout_while(pending, timeout, |slot| !slot.ready)
            .unwrap_or_else(|p| p.into_inner());
        if pending.ready {
            Ok(())
        } else {
            Err(EditorError::Media(
                "GStreamer did not publish the requested preview frame".into(),
            ))
        }
    }
}

/// Installs a one-frame appsink with aspect-preserving preview dimensions.
pub fn attach(pipeline: &ges::Pipeline, canvas: &Canvas, frames: Frames) -> Result<()> {
    let factor = 1.
        / f64::from(
            frames
                .quality
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .divisor(),
        );
    let width = (canvas.width as f64 * factor).round().max(1.) as u32;
    let height = (canvas.height as f64 * factor).round().max(1.) as u32;
    let transport = *frames.transport.lock().unwrap_or_else(|p| p.into_inner());
    let description = match transport {
        super::gpu::types::PreviewTransport::Rgba => super::gpu::preview_sink(width, height),
        #[cfg(target_os = "linux")]
        super::gpu::types::PreviewTransport::DmaBuf => {
            super::gpu::external_preview_sink(width, height)
        }
    };
    let sink = gst::parse::bin_from_description(&description, true).map_err(media)?;
    let appsink = sink
        .by_name("preview")
        .ok_or_else(|| EditorError::Media("missing preview sink".into()))?
        .downcast::<gst_app::AppSink>()
        .map_err(|_| EditorError::Media("invalid preview sink".into()))?;
    appsink.set_max_buffers(1);
    appsink.set_drop(true);
    appsink.set_sync(true);
    if transport != super::gpu::types::PreviewTransport::Rgba {
        let producer = Arc::clone(&frames);
        sink.by_name("preview_transfer")
            .and_then(|element| element.static_pad("sink"))
            .ok_or_else(|| media("missing GPU preview transfer"))?
            .add_probe(gst::PadProbeType::BUFFER, move |_, info| {
                *producer.producer.lock().unwrap_or_else(|p| p.into_inner()) =
                    info.buffer().cloned();
                gst::PadProbeReturn::Ok
            });
    }
    let counter = Arc::new(AtomicU64::new(0));
    let preroll_frames = Arc::clone(&frames);
    let preroll_counter = Arc::clone(&counter);
    appsink.set_callbacks(
        gst_app::AppSinkCallbacks::builder()
            .propose_allocation(|_, query| {
                query.add_allocation_meta::<gst_video::VideoMeta>(None);
                true
            })
            .new_sample(move |sink| {
                publish(
                    sink.pull_sample().map_err(|_| gst::FlowError::Eos)?,
                    &frames,
                    &counter,
                )
            })
            .new_preroll(move |sink| {
                publish(
                    sink.pull_preroll().map_err(|_| gst::FlowError::Eos)?,
                    &preroll_frames,
                    &preroll_counter,
                )
            })
            .build(),
    );
    pipeline.preview_set_video_sink(Some(&sink));
    Ok(())
}
fn publish(
    sample: gst::Sample,
    frames: &Frames,
    sequence: &AtomicU64,
) -> std::result::Result<gst::FlowSuccess, gst::FlowError> {
    #[cfg(target_os = "linux")]
    if *frames.transport.lock().unwrap_or_else(|p| p.into_inner())
        == super::gpu::types::PreviewTransport::DmaBuf
    {
        let info =
            gst_video::VideoInfoDmaDrm::from_caps(sample.caps().ok_or(gst::FlowError::Error)?)
                .map_err(|_| gst::FlowError::Error)?;
        let producer = frames
            .producer
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .take()
            .ok_or(gst::FlowError::Error)?;
        let external =
            super::gpu::transfer::dmabuf(&sample, producer).map_err(|_| gst::FlowError::Error)?;
        frames.publish(PreviewFrame {
            sequence: sequence.fetch_add(1, Ordering::Relaxed),
            position_ms: sample
                .buffer()
                .and_then(|buffer| buffer.pts())
                .ok_or(gst::FlowError::Error)?
                .mseconds(),
            width: info.width(),
            height: info.height(),
            rgba: vec![],
            external: Some(external),
        });
        return Ok(gst::FlowSuccess::Ok);
    }
    let info = gst_video::VideoInfo::from_caps(sample.caps().ok_or(gst::FlowError::Error)?)
        .map_err(|_| gst::FlowError::Error)?;
    let frame = gst_video::VideoFrameRef::from_buffer_ref_readable(
        sample.buffer().ok_or(gst::FlowError::Error)?,
        &info,
    )
    .map_err(|_| gst::FlowError::Error)?;
    let plane = frame.plane_data(0).map_err(|_| gst::FlowError::Error)?;
    let stride = usize::try_from(frame.plane_stride()[0]).map_err(|_| gst::FlowError::Error)?;
    let row = info.width() as usize * 4;
    let mut rgba = Vec::with_capacity(row * info.height() as usize);
    for y in 0..info.height() as usize {
        rgba.extend_from_slice(
            plane
                .get(y * stride..y * stride + row)
                .ok_or(gst::FlowError::Error)?,
        );
    }
    frames.publish(PreviewFrame {
        sequence: sequence.fetch_add(1, Ordering::Relaxed),
        position_ms: sample
            .buffer()
            .and_then(|buffer| buffer.pts())
            .ok_or(gst::FlowError::Error)?
            .mseconds(),
        width: info.width(),
        height: info.height(),
        rgba,
        external: None,
    });
    Ok(gst::FlowSuccess::Ok)
}

/// Binds clip placement and Beam zooms to GES VideoSource properties, once per build.
pub fn configure_geometry(
    source: &ges::TrackElement,
    asset: &MediaAsset,
    clip: &Clip,
    canvas: &Canvas,
) -> Result<()> {
    let aspect = asset.width as f64 / asset.height as f64;
    let width = (canvas.width as f64).min(canvas.height as f64 * aspect) * clip.effects.scale;
    let height = width / aspect;
    for (property, value) in [
        ("width", width),
        ("height", height),
        ("posx", canvas.width as f64 * clip.effects.x - width * 0.5),
        ("posy", canvas.height as f64 * clip.effects.y - height * 0.5),
    ] {
        ges::prelude::TimelineElementExtManual::set_child_property(
            source,
            property,
            (value.round() as i32).to_value(),
        )
        .map_err(media)?;
    }
    Ok(())
}
