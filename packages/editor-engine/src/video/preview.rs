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
        self.expect_position_rate(time, fps, 1);
    }
    /// Fractional rates use the actual frame duration when accepting a seek result.
    pub fn expect_position_rate(&self, time: u64, numerator: u32, denominator: u32) {
        let mut slot = self.pending.lock().unwrap_or_else(|p| p.into_inner());
        slot.frame = None;
        slot.ready = false;
        slot.window = Some((
            time.saturating_sub(1),
            time.saturating_add(
                (1000 * u64::from(denominator.max(1))).div_ceil(u64::from(numerator.max(1))),
            ),
        ));
    }
    /// Associate a request with the real downstream Segment before accepting its frames.
    pub fn seek(
        &self,
        pipeline: &ges::Pipeline,
        position: gst::ClockTime,
        numerator: u32,
        denominator: u32,
    ) -> Result<gst::Seqnum> {
        if numerator == 0 || denominator == 0 || position.nseconds() > i64::MAX as u64 {
            return Err(EditorError::Invalid(
                "invalid native preview clock or frame rate".into(),
            ));
        }
        let timeline = pipeline
            .timeline()
            .ok_or_else(|| media("native preview seek requires a prepared timeline"))?;
        let duration = timeline.duration();
        if duration == gst::ClockTime::ZERO
            || duration.nseconds() > i64::MAX as u64
            || position > duration
        {
            return Err(EditorError::Invalid(
                "native preview seek is outside a finite prepared timeline".into(),
            ));
        }
        let event = gst::event::Seek::new(
            1.,
            gst::SeekFlags::FLUSH | gst::SeekFlags::ACCURATE,
            gst::SeekType::Set,
            position,
            // NLE may retain the previous stack's stop when the seek uses NONE.
            // Explicitly reset it before seeking beyond the first cut or window.
            gst::SeekType::Set,
            duration,
        );
        let seqnum = event.seqnum();
        let time = position.mseconds();
        {
            let _delivery = self.delivery.lock().unwrap_or_else(|p| p.into_inner());
            let mut slot = self.pending.lock().unwrap_or_else(|p| p.into_inner());
            slot.frame = None;
            slot.ready = false;
            slot.window = Some((
                time.saturating_sub(1),
                time.saturating_add((1000 * u64::from(denominator)).div_ceil(u64::from(numerator))),
            ));
            slot.gate.expect(seqnum);
        }
        if !pipeline.send_event(event) {
            return Err(media("GStreamer rejected the preview seek"));
        }
        Ok(seqnum)
    }
    pub fn resume(&self) {
        self.pending
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .window = None;
    }
    pub fn publish(&self, frame: PreviewFrame) {
        self.publish_segment(frame, None);
    }
    fn segment_marker(&self, buffer: &gst::BufferRef) -> Option<gst::Seqnum> {
        self.pending
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .gate
            .marker(buffer)
    }
    fn accepts_segment(&self, marker: Option<gst::Seqnum>) -> bool {
        self.pending
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .gate
            .accepts(marker)
    }
    fn publish_segment(&self, frame: PreviewFrame, marker: Option<gst::Seqnum>) {
        let _delivery = self.delivery.lock().unwrap_or_else(|p| p.into_inner());
        let mut slot = self.pending.lock().unwrap_or_else(|p| p.into_inner());
        if !slot.gate.accepts(marker)
            || slot
                .window
                .is_some_and(|(start, end)| frame.position_ms < start || frame.position_ms > end)
        {
            return;
        }
        let consumer = self
            .consumer
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone();
        if let Some(consume) = consumer {
            drop(slot);
            consume(frame);
            self.pending.lock().unwrap_or_else(|p| p.into_inner()).ready = true;
            self.ready.notify_all();
            return;
        }
        let target = self
            .forward
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .upgrade();
        if let Some(target) = target {
            drop(slot);
            target.publish(frame);
            self.pending.lock().unwrap_or_else(|p| p.into_inner()).ready = true;
        } else {
            slot.frame = Some(frame);
            slot.ready = true;
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
    super::frame_gate::register();
    let segments = Arc::clone(&frames);
    appsink
        .static_pad("sink")
        .ok_or_else(|| media("preview sink has no input"))?
        .add_probe(
            gst::PadProbeType::EVENT_DOWNSTREAM
                | gst::PadProbeType::EVENT_FLUSH
                | gst::PadProbeType::BUFFER,
            move |pad, info| {
                let mut slot = segments.pending.lock().unwrap_or_else(|p| p.into_inner());
                if let Some(event) = info.event() {
                    slot.gate.observe(event);
                }
                if let Some(buffer) = info.buffer_mut() {
                    if !slot.gate.accepts(slot.gate.active()) {
                        return gst::PadProbeReturn::Drop;
                    }
                    if let Err(error) = slot.gate.stamp(buffer.make_mut()) {
                        if let Some(element) = pad.parent_element() {
                            gst::element_error!(element, gst::StreamError::Failed, ("{error}"));
                        }
                        return gst::PadProbeReturn::Drop;
                    }
                }
                gst::PadProbeReturn::Ok
            },
        );
    if transport != super::gpu::types::PreviewTransport::Rgba {
        let transfer = sink
            .by_name("preview_transfer")
            .ok_or_else(|| media("missing GPU preview transfer"))?;
        super::preview_lease::attach(&transfer)?;
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
    let marker = frames.segment_marker(sample.buffer().ok_or(gst::FlowError::Error)?);
    if marker.is_none() || !frames.accepts_segment(marker) {
        return Ok(gst::FlowSuccess::Ok);
    }
    #[cfg(target_os = "linux")]
    if *frames.transport.lock().unwrap_or_else(|p| p.into_inner())
        == super::gpu::types::PreviewTransport::DmaBuf
    {
        let info =
            gst_video::VideoInfoDmaDrm::from_caps(sample.caps().ok_or(gst::FlowError::Error)?)
                .map_err(|_| gst::FlowError::Error)?;
        let producer =
            super::preview_lease::producer(&sample).map_err(|_| gst::FlowError::Error)?;
        let external =
            super::gpu::transfer::dmabuf(&sample, producer).map_err(|_| gst::FlowError::Error)?;
        frames.publish_segment(
            PreviewFrame {
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
            },
            marker,
        );
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
    frames.publish_segment(
        PreviewFrame {
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
        },
        marker,
    );
    Ok(gst::FlowSuccess::Ok)
}

/// Binds clip placement and Beam zooms to GES VideoSource properties, once per build.
pub fn configure_geometry(
    source: &ges::TrackElement,
    asset: &MediaAsset,
    clip: &Clip,
    canvas: &Canvas,
) -> Result<()> {
    for (property, value) in geometry(asset, clip, canvas) {
        ges::prelude::TimelineElementExtManual::set_child_property(
            source,
            property,
            value.to_value(),
        )
        .map_err(media)?;
    }
    Ok(())
}
pub(crate) fn geometry(
    asset: &MediaAsset,
    clip: &Clip,
    canvas: &Canvas,
) -> [(&'static str, i32); 4] {
    geometry_size(asset.width, asset.height, clip, canvas)
}
pub(crate) fn geometry_size(
    width: u32,
    height: u32,
    clip: &Clip,
    canvas: &Canvas,
) -> [(&'static str, i32); 4] {
    let aspect = width as f64 / height as f64;
    let width = (canvas.width as f64).min(canvas.height as f64 * aspect) * clip.effects.scale;
    let height = width / aspect;
    [
        ("width", width),
        ("height", height),
        ("posx", canvas.width as f64 * clip.effects.x - width * 0.5),
        ("posy", canvas.height as f64 * clip.effects.y - height * 0.5),
    ]
    .map(|(property, value)| (property, value.round() as i32))
}
