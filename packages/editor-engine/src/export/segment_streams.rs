//! Stream handoff retains GL buffers and clips audio by one global sample clock.
use super::{
    segment_schedule::{AUDIO_RATE, audio_time, frame_time},
    segment_types::{Segment, StreamCounters},
};
use crate::{Canvas, Result, video::pipeline::media};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

pub(crate) fn video(
    sink: &gst_app::AppSink,
    source: &gst_app::AppSrc,
    canvas: Canvas,
    segment: Segment,
    counters: Arc<StreamCounters>,
    cancel: Arc<AtomicBool>,
) {
    let source = source.clone();
    sink.set_callbacks(
        gst_app::AppSinkCallbacks::builder()
            .new_sample(move |sink| {
                if cancel.load(Ordering::Acquire) {
                    return Err(gst::FlowError::Flushing);
                }
                let sample = sink.pull_sample().map_err(|_| gst::FlowError::Error)?;
                let result = (|| -> Result<()> {
                    let buffer = sample
                        .buffer()
                        .ok_or_else(|| media("video segment has no raw buffer"))?;
                    let pts = buffer
                        .pts()
                        .ok_or_else(|| media("video segment has no timestamp"))?
                        .nseconds();
                    let next = counters.video.load(Ordering::Acquire);
                    let duration = buffer
                        .duration()
                        .ok_or_else(|| media("video segment has no presentation duration"))?
                        .nseconds();
                    let Some(index) = video_frame(&canvas, pts, duration, next, segment.end_frame)?
                    else {
                        return Ok(());
                    };
                    let pts = frame_time(&canvas, index)?;
                    let end = frame_time(&canvas, index + 1)?.min(segment.end_ns);
                    let mut output = buffer.to_owned();
                    let writable = output.make_mut();
                    writable.set_pts(gst::ClockTime::from_nseconds(pts));
                    writable.set_dts(gst::ClockTime::NONE);
                    writable.set_duration(gst::ClockTime::from_nseconds(end - pts));
                    if index > 0 {
                        writable.unset_flags(gst::BufferFlags::DISCONT);
                    }
                    source.push_buffer(output).map_err(media)?;
                    counters.video.store(index + 1, Ordering::Release);
                    Ok(())
                })();
                finish(sink, result)
            })
            .build(),
    );
}

/// NLE operations can restart a native frame grid between project frames. Pick
/// the real buffer presented at the next global frame time, rather than rounding
/// its start to an index (which aliases half-frame starts and invents a gap).
/// No held frame is repeated and an uncovered presentation instant is an error.
pub fn video_frame(
    canvas: &Canvas,
    start: u64,
    duration: u64,
    next: u64,
    end: u64,
) -> Result<Option<u64>> {
    if next >= end {
        return Ok(None);
    }
    if duration == 0 {
        return Err(media("video buffer has an empty presentation interval"));
    }
    let stop = start
        .checked_add(duration)
        .ok_or_else(|| media("video presentation clock overflow"))?;
    let target = frame_time(canvas, next)?;
    if stop <= target {
        return Ok(None);
    }
    // GStreamer's frame grid truncates nanoseconds; domain times round once.
    // Adding a rounded seek origin can differ by one representable nanosecond.
    if start > target.saturating_add(1) {
        return Err(media(format!(
            "video segment discontinuity: frame {next} at {target} ns is not covered by buffer [{start},{stop})"
        )));
    }
    Ok(Some(next))
}

pub(crate) fn audio(
    sink: &gst_app::AppSink,
    source: &gst_app::AppSrc,
    segment: Segment,
    counters: Arc<StreamCounters>,
    cancel: Arc<AtomicBool>,
) {
    let source = source.clone();
    sink.set_callbacks(
        gst_app::AppSinkCallbacks::builder()
            .new_sample(move |sink| {
                if cancel.load(Ordering::Acquire) {
                    return Err(gst::FlowError::Flushing);
                }
                let sample = sink.pull_sample().map_err(|_| gst::FlowError::Error)?;
                let result = (|| -> Result<()> {
                    let buffer = sample
                        .buffer()
                        .ok_or_else(|| media("audio segment has no raw buffer"))?;
                    let pts = buffer
                        .pts()
                        .ok_or_else(|| media("audio segment has no timestamp"))?
                        .nseconds();
                    let next = counters.audio.load(Ordering::Acquire);
                    let start = audio_time(pts)?;
                    let (bytes, end) = audio_region(start, buffer.size(), next, segment.end_audio)?;
                    let Some(bytes) = bytes else {
                        return Ok(());
                    };
                    let mut output = buffer
                        .copy_region(gst::BUFFER_COPY_ALL, bytes)
                        .map_err(media)?;
                    let writable = output.make_mut();
                    let pts = sample_time(next);
                    writable.set_pts(gst::ClockTime::from_nseconds(pts));
                    writable.set_dts(gst::ClockTime::NONE);
                    writable.set_duration(gst::ClockTime::from_nseconds(sample_time(end) - pts));
                    writable.set_offset(next);
                    writable.set_offset_end(end);
                    if next > 0 {
                        writable.unset_flags(gst::BufferFlags::DISCONT);
                    }
                    source.push_buffer(output).map_err(media)?;
                    counters.audio.store(end, Ordering::Release);
                    Ok(())
                })();
                finish(sink, result)
            })
            .build(),
    );
}

/// Packed stereo F32 frames are shared by region; no audio samples are invented.
pub fn audio_region(
    start: u64,
    bytes: usize,
    next: u64,
    end: u64,
) -> Result<(Option<std::ops::Range<usize>>, u64)> {
    if !bytes.is_multiple_of(8) {
        return Err(media("audio buffer is not packed stereo F32"));
    }
    let stop = start
        .checked_add(bytes as u64 / 8)
        .ok_or_else(|| media("audio sample clock overflow"))?
        .min(end);
    if stop <= next {
        return Ok((None, next));
    }
    if start > next {
        return Err(media(format!(
            "audio segment discontinuity: expected sample {next}, received {start}"
        )));
    }
    let begin = usize::try_from((next - start) * 8).map_err(media)?;
    let finish = usize::try_from((stop - start) * 8).map_err(media)?;
    Ok((Some(begin..finish), stop))
}
fn sample_time(sample: u64) -> u64 {
    ((u128::from(sample) * 1_000_000_000 + u128::from(AUDIO_RATE) / 2) / u128::from(AUDIO_RATE))
        as u64
}
fn finish(
    sink: &gst_app::AppSink,
    result: Result<()>,
) -> std::result::Result<gst::FlowSuccess, gst::FlowError> {
    if let Err(error) = result {
        gst::element_error!(
            sink,
            gst::StreamError::Failed,
            ("raw export handoff failed: {error}")
        );
        Err(gst::FlowError::Error)
    } else {
        Ok(gst::FlowSuccess::Ok)
    }
}
