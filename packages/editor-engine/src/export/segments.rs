//! Immutable source windows feed one hardware encoder and muxer through bounded
//! GLMemory/PCM queues. Segment replacement never restarts encoded audio.
use super::{
    segment_types::{SegmentPolicy, SegmentReport, StreamCounters},
    types::{Container, VideoEncoder},
};
use crate::{Project, Result, video::pipeline::media};
use gst::prelude::*;
use std::{
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

pub fn render(
    root: &Path,
    project: &Project,
    path: &Path,
    container: Container,
    encoder: VideoEncoder,
    cancel: Arc<AtomicBool>,
    progress: impl FnMut(u64),
) -> Result<bool> {
    Ok(render_with_policy(
        root,
        project,
        path,
        container,
        encoder,
        cancel,
        progress,
        SegmentPolicy::default(),
    )?
    .is_some())
}

#[allow(clippy::too_many_arguments)]
pub fn render_with_policy(
    root: &Path,
    project: &Project,
    path: &Path,
    container: Container,
    encoder: VideoEncoder,
    cancel: Arc<AtomicBool>,
    progress: impl FnMut(u64),
    policy: SegmentPolicy,
) -> Result<Option<SegmentReport>> {
    render_with_source(
        root,
        project,
        path,
        container,
        encoder,
        cancel,
        progress,
        policy,
        crate::video::pipeline::build_window,
    )
}

/// All native compositions share the same continuity checks and hardware encoder.
/// Experimental graphs can be proved here without enabling their public edit path.
#[allow(clippy::too_many_arguments)]
pub fn render_with_source(
    root: &Path,
    project: &Project,
    path: &Path,
    container: Container,
    encoder: VideoEncoder,
    cancel: Arc<AtomicBool>,
    mut progress: impl FnMut(u64),
    policy: SegmentPolicy,
    source_builder: super::segment_types::SourceBuilder,
) -> Result<Option<SegmentReport>> {
    crate::project::validation::project(project)?;
    crate::video::gpu::initialize()?;
    let schedule = super::segment_schedule::for_project(project, policy)?;
    if cancel.load(Ordering::Acquire) {
        return Ok(None);
    }
    let mut encoder = super::segment_encoder::build(project, path, container, encoder)?;
    let encoder_bus = encoder
        .pipeline
        .bus()
        .ok_or_else(|| media("export encoder has no bus"))?;
    let counters = Arc::new(StreamCounters::default());
    let mut report = SegmentReport::default();
    for segment in schedule {
        if cancel.load(Ordering::Acquire) {
            return Ok(None);
        }
        let (producer, guard) = super::segment_source::build(
            root,
            project,
            segment,
            &mut encoder,
            counters.clone(),
            cancel.clone(),
            source_builder,
        )?;
        report.peak_native_clips = report
            .peak_native_clips
            .max(crate::video::source_runs::allocated(&producer));
        let bus = producer
            .bus()
            .ok_or_else(|| media("export source window has no bus"))?;
        let mut last_progress = Instant::now();
        let mut seen = counters.video.load(Ordering::Acquire);
        loop {
            if cancel.load(Ordering::Acquire) {
                encoder
                    .pipeline
                    .set_state(gst::State::Null)
                    .map_err(media)?;
                drop(guard);
                return Ok(None);
            }
            if let Some(message) = encoder_bus.pop_filtered(&[gst::MessageType::Error]) {
                return Err(message_error(&message));
            }
            if let Some(message) = bus.timed_pop_filtered(
                gst::ClockTime::from_mseconds(100),
                &[gst::MessageType::Eos, gst::MessageType::Error],
            ) {
                match message.view() {
                    gst::MessageView::Eos(..) => break,
                    _ => return Err(message_error(&message)),
                }
            }
            let frame = counters.video.load(Ordering::Acquire);
            if frame != seen {
                seen = frame;
                last_progress = Instant::now();
                progress(
                    super::segment_schedule::frame_time(&project.canvas, frame)?
                        .min(segment.end_ns)
                        / 1_000_000,
                );
            }
            if last_progress.elapsed() > Duration::from_secs(30) {
                return Err(media(
                    "export source or encoder made no progress for 30 seconds",
                ));
            }
            drive_context();
        }
        if counters.video.load(Ordering::Acquire) != segment.end_frame
            || encoder.audio.is_some()
                && counters.audio.load(Ordering::Acquire) != segment.end_audio
        {
            return Err(media(format!(
                "incomplete raw segment: video {} of {}, audio {} of {}",
                counters.video.load(Ordering::Acquire),
                segment.end_frame,
                counters.audio.load(Ordering::Acquire),
                segment.end_audio
            )));
        }
        guard.finish();
        report.segments += 1;
        progress(segment.end_ns / 1_000_000);
    }
    encoder.video.end_of_stream().map_err(media)?;
    if let Some(audio) = &encoder.audio {
        audio.end_of_stream().map_err(media)?;
    }
    let drain = Instant::now();
    loop {
        if cancel.load(Ordering::Acquire) {
            return Ok(None);
        }
        if let Some(message) = encoder_bus.timed_pop_filtered(
            gst::ClockTime::from_mseconds(100),
            &[gst::MessageType::Eos, gst::MessageType::Error],
        ) {
            match message.view() {
                gst::MessageView::Eos(..) => break,
                _ => return Err(message_error(&message)),
            }
        }
        if drain.elapsed() > Duration::from_secs(30) {
            return Err(media("hardware encoder did not drain for 30 seconds"));
        }
        drive_context();
    }
    report.video_frames = counters.video.load(Ordering::Acquire);
    report.audio_samples = counters.audio.load(Ordering::Acquire);
    encoder
        .pipeline
        .set_state(gst::State::Null)
        .map_err(media)?;
    Ok(Some(report))
}
fn drive_context() {
    if let Some(context) = gst::glib::MainContext::thread_default() {
        while context.pending() {
            context.iteration(false);
        }
    }
}
fn message_error(message: &gst::Message) -> crate::EditorError {
    if let gst::MessageView::Error(error) = message.view() {
        media(format!(
            "{} ({})",
            error.error(),
            error.debug().unwrap_or_default()
        ))
    } else {
        media(format!("unexpected export message: {message:?}"))
    }
}
