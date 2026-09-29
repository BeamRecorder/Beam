//! Segment boundaries align video frames; audio uses one absolute sample clock.
use super::segment_types::{Segment, SegmentPolicy};
use crate::{
    Canvas, Project, Result,
    video::{pipeline::media, plan_types::RenderPlan},
};
pub const AUDIO_RATE: u64 = 48_000;
pub fn schedule(canvas: &Canvas, duration_ms: u64, policy: SegmentPolicy) -> Result<Vec<Segment>> {
    if canvas.fps == 0
        || canvas.fps_denominator == 0
        || policy.window_ms == 0
        || policy.target_native_clips == 0
        || duration_ms == 0
    {
        return Err(media("invalid segment schedule dimensions or duration"));
    }
    let denominator = 1000 * u128::from(canvas.fps_denominator);
    let frames = (u128::from(duration_ms) * u128::from(canvas.fps)).div_ceil(denominator);
    let budget = (u128::from(policy.window_ms) * u128::from(canvas.fps) / denominator).max(1);
    let duration_ns = duration_ms
        .checked_mul(1_000_000)
        .ok_or_else(|| media("segment duration overflow"))?;
    let mut result = Vec::new();
    let mut frame = 0;
    while frame < frames {
        let end = (frame + budget).min(frames);
        let start_ns = frame_time(canvas, u64::try_from(frame).map_err(media)?)?;
        let end_ns = frame_time(canvas, u64::try_from(end).map_err(media)?)?.min(duration_ns);
        result.push(Segment {
            start_frame: frame as u64,
            end_frame: end as u64,
            start_ns,
            end_ns,
            start_audio: audio_time(start_ns)?,
            end_audio: audio_time(end_ns)?,
        });
        frame = end;
    }
    Ok(result)
}

/// Dense edits shrink source windows without loading clip effect payloads.
/// At least one complete composition frame is rendered even when its concurrent
/// source count exceeds the allocation target; no layer or instance is omitted.
pub fn for_project(project: &Project, policy: SegmentPolicy) -> Result<Vec<Segment>> {
    let nominal = schedule(&project.canvas, project.duration_ms(), policy)?;
    let mut result = Vec::new();
    for window in nominal {
        let mut start = window.start_frame;
        while start < window.end_frame {
            let start_ns = frame_time(&project.canvas, start)?;
            let count = |end| -> Result<usize> {
                let end_ns = frame_time(&project.canvas, end)?.min(window.end_ns);
                Ok(RenderPlan::range(
                    project,
                    start_ns / 1_000_000,
                    end_ns.div_ceil(1_000_000).min(project.duration_ms()),
                )?
                .clips
                .len())
            };
            let mut end = window.end_frame;
            if count(end)? > policy.target_native_clips {
                let mut low = start + 1;
                let mut high = end;
                while low < high {
                    let candidate = low + (high - low).div_ceil(2);
                    if count(candidate)? <= policy.target_native_clips {
                        low = candidate;
                    } else {
                        high = candidate - 1;
                    }
                }
                end = low;
            }
            let end_ns = frame_time(&project.canvas, end)?.min(window.end_ns);
            result.push(Segment {
                start_frame: start,
                end_frame: end,
                start_ns,
                end_ns,
                start_audio: audio_time(start_ns)?,
                end_audio: audio_time(end_ns)?,
            });
            start = end;
        }
    }
    Ok(result)
}
pub(crate) fn frame_time(canvas: &Canvas, frame: u64) -> Result<u64> {
    beam_editor_domain::timing::FrameRate {
        numerator: canvas.fps,
        denominator: canvas.fps_denominator,
    }
    .time_at_frame(i64::try_from(frame).map_err(media)?)?
    .nanoseconds()
}
pub(crate) fn audio_time(nanoseconds: u64) -> Result<u64> {
    u64::try_from((u128::from(nanoseconds) * u128::from(AUDIO_RATE) + 500_000_000) / 1_000_000_000)
        .map_err(media)
}
