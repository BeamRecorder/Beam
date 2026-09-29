//! One active GES window supplies raw samples to the job's continuing encoder.
use super::{
    segment_streams,
    segment_types::{Encoder, PipelineGuard, Segment, StreamCounters},
};
use crate::{Project, Result, video::pipeline::media};
use ges::prelude::*;
use std::sync::{Arc, atomic::AtomicBool};

pub(crate) fn build(
    root: &std::path::Path,
    project: &Project,
    segment: Segment,
    encoder: &mut Encoder,
    counters: Arc<StreamCounters>,
    cancel: Arc<AtomicBool>,
    source_builder: super::segment_types::SourceBuilder,
) -> Result<(ges::Pipeline, PipelineGuard)> {
    let producer = source_builder(
        root,
        project,
        segment.start_ns / 1_000_000,
        segment
            .end_ns
            .div_ceil(1_000_000)
            .min(project.duration_ms()),
    )?;
    let guard = PipelineGuard(producer.clone().upcast(), Some(encoder.pipeline.clone()));
    if let Some(context) = &encoder.context {
        producer.set_context(context);
    }
    let video = super::gpu::source_sink(
        &project.canvas,
        crate::video::scoped_pipeline::compiled(&producer),
    )?;
    let video_sink = video
        .by_name("beam_segment_video")
        .ok_or_else(|| media("source window has no video sink"))?
        .downcast::<gst_app::AppSink>()
        .map_err(|_| media("invalid source video sink"))?;
    video_sink.set_max_buffers(2);
    producer.preview_set_video_sink(Some(&video));
    let audio = if encoder.audio.is_some() {
        let audio=gst::parse::bin_from_description("audioconvert ! audioresample ! audio/x-raw,format=F32LE,rate=48000,channels=2,layout=interleaved ! appsink name=beam_segment_audio sync=false enable-last-sample=false",true).map_err(media)?;
        let sink = audio
            .by_name("beam_segment_audio")
            .ok_or_else(|| media("source window has no audio sink"))?
            .downcast::<gst_app::AppSink>()
            .map_err(|_| media("invalid source audio sink"))?;
        sink.set_max_buffers(2);
        producer.preview_set_audio_sink(Some(&audio));
        Some(sink)
    } else {
        None
    };
    producer.set_state(gst::State::Paused).map_err(media)?;
    preroll(&producer)?;
    producer
        .seek(
            1.,
            gst::SeekFlags::FLUSH | gst::SeekFlags::ACCURATE,
            gst::SeekType::Set,
            gst::ClockTime::from_nseconds(segment.start_ns),
            gst::SeekType::Set,
            gst::ClockTime::from_nseconds(segment.end_ns.saturating_add(100_000_000)),
        )
        .map_err(media)?;
    preroll(&producer)?;
    let sample = video_sink
        .try_pull_preroll(gst::ClockTime::from_seconds(15))
        .ok_or_else(|| media("source window produced no raw video preroll"))?;
    super::segment_encoder::share_context(encoder, &producer, &sample)?;
    segment_streams::video(
        &video_sink,
        &encoder.video,
        project.canvas.clone(),
        segment,
        counters.clone(),
        cancel.clone(),
    );
    if let (Some(sink), Some(source)) = (audio, encoder.audio.as_ref()) {
        segment_streams::audio(&sink, source, segment, counters, cancel);
    }
    encoder
        .pipeline
        .set_state(gst::State::Playing)
        .map_err(media)?;
    producer.set_state(gst::State::Playing).map_err(media)?;
    Ok((producer, guard))
}
fn preroll(pipeline: &ges::Pipeline) -> Result<()> {
    let (result, current, _) = pipeline.state(gst::ClockTime::from_seconds(15));
    result.map_err(media)?;
    if current == gst::State::Paused {
        return Ok(());
    }
    if let Some(message) = pipeline
        .bus()
        .and_then(|bus| bus.pop_filtered(&[gst::MessageType::Error]))
    {
        return Err(media(format!("source window preroll failed: {message:?}")));
    }
    Err(media("source window preroll exceeded 15 seconds"))
}
