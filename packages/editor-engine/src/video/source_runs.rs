//! Reuse decoders only when adjacent neutral cuts consume one exact source interval.
use super::source_run_types::{SourceAllocation, SourceRun};
use crate::{Clip, Project, Result, video::pipeline::media};
use gst::prelude::*;
use std::{collections::HashSet, sync::Arc};
const ALLOCATION_KEY: &str = "beam-editor-source-allocation-v1";

pub fn compile(
    project: &Project,
    mut clips: Vec<Arc<Clip>>,
    reuse: bool,
) -> Result<Vec<SourceRun>> {
    clips.sort_by_key(|clip| (clip.start_ms, clip.id));
    let transitions: HashSet<_> = project
        .transitions
        .iter()
        .flat_map(|t| [t.from_clip, t.to_clip])
        .collect();
    let mut result: Vec<SourceRun> = Vec::new();
    for clip in clips {
        let eligible = reuse && neutral(project, &clip) && !transitions.contains(&clip.id);
        if eligible
            && let Some(previous) = result.last_mut()
            && neutral(project, &previous.first)
            && !transitions.contains(&previous.first.id)
            && continuous(&previous.first, previous.duration_ms, &clip)
        {
            previous.duration_ms = previous
                .duration_ms
                .checked_add(clip.duration_ms)
                .ok_or_else(|| media("source run duration overflow"))?;
            previous.logical_ids.push(clip.id);
            continue;
        }
        result.push(SourceRun {
            duration_ms: clip.duration_ms,
            logical_ids: vec![clip.id],
            first: clip,
        });
    }
    Ok(result)
}

fn neutral(project: &Project, clip: &Clip) -> bool {
    let e = &clip.effects;
    clip.generator.is_none()
        && clip.title.is_none()
        && clip.instances.is_empty()
        && clip.cursor_style.is_none()
        && clip.link_group.is_none()
        && e.opacity == 1.
        && e.volume == 1.
        && e.brightness == 0.
        && e.saturation == 1.
        && e.scale == 1.
        && e.x == 0.5
        && e.y == 0.5
        && e.fade_in_ms == 0
        && e.fade_out_ms == 0
        && project
            .assets
            .iter()
            .find(|asset| asset.id == clip.asset_id)
            .is_some_and(|asset| {
                !asset.is_image
                    && asset.cursor.is_empty()
                    && asset.zooms.is_empty()
                    && asset.cursor_mode
                        != beam_editor_domain::recording::style_types::CursorMode::Separated
            })
}

fn continuous(a: &Clip, duration: u64, b: &Clip) -> bool {
    a.track_id == b.track_id
        && a.asset_id == b.asset_id
        && a.rate == b.rate
        && a.start_ms.checked_add(duration) == Some(b.start_ms)
        && u128::from(a.source_in_ms) * u128::from(a.rate.denominator)
            + u128::from(duration) * u128::from(a.rate.numerator)
            == u128::from(b.source_in_ms) * u128::from(a.rate.denominator)
}

pub(crate) fn attach(pipeline: &ges::Pipeline, count: usize, reused: bool) {
    // SAFETY: this module writes the exact private type once before publication.
    unsafe {
        pipeline.set_data(ALLOCATION_KEY, SourceAllocation { count, reused });
    }
}
pub fn allocated(pipeline: &ges::Pipeline) -> usize {
    // SAFETY: attach owns this key and the pipeline stays retained while read.
    unsafe {
        pipeline
            .data::<SourceAllocation>(ALLOCATION_KEY)
            .map_or(0, |allocation| allocation.as_ref().count)
    }
}
pub(crate) fn reused(pipeline: &ges::Pipeline) -> bool {
    // SAFETY: attach owns this key and the pipeline stays retained while read.
    unsafe {
        pipeline
            .data::<SourceAllocation>(ALLOCATION_KEY)
            .is_some_and(|allocation| allocation.as_ref().reused)
    }
}
