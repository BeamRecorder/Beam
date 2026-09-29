//! Structural edits prepare another graph; parameter edits publish one decision snapshot.
use super::{state, types::ParameterUpdate};
use crate::{Project, Result, video::pipeline::media};
use beam_editor_domain::collections::headers::{ClipHeader, InstanceHeader};
use beam_editor_domain::effects::Instance;
use ges::prelude::*;

pub fn prepare(
    pipeline: &ges::Pipeline,
    before: &Project,
    after: &Project,
) -> Result<Option<ParameterUpdate>> {
    crate::project::validation::project(after)?;
    let plan = super::super::plan::get(pipeline);
    if !compatible(before, after, plan.as_ref())? {
        return Ok(None);
    }
    let Some(shared) = state::get(pipeline) else {
        return Ok(None);
    };
    let clips = super::super::scoped_pipeline::nodes(pipeline)
        .into_iter()
        .filter_map(|node| node.name().map(|name| (name.to_string(), node)))
        .fold(
            std::collections::HashMap::<String, Vec<ges::Clip>>::new(),
            |mut nodes, (name, node)| {
                nodes.entry(name).or_default().push(node);
                nodes
            },
        );
    let reused = super::super::source_runs::reused(pipeline);
    if reused
        && super::super::pipeline::loaded_clips(before, plan.as_ref())?
            .iter()
            .zip(super::super::pipeline::loaded_clips(after, plan.as_ref())?.iter())
            .any(|(a, b)| a != b)
    {
        return Ok(None);
    }
    let mut properties = Vec::new();
    for clip in super::super::pipeline::loaded_clips(after, plan.as_ref())? {
        let nodes = match clips.get(&format!("clip-{}", clip.id)) {
            Some(nodes) => nodes,
            None if reused => continue,
            None => return Err(media("parameter update has a missing native clip")),
        };
        for child in nodes.iter().flat_map(|node| node.children(false)) {
            let Ok(element) = child.downcast::<ges::TrackElement>() else {
                continue;
            };
            if !element.is::<ges::VideoSource>() {
                continue;
            }
            let hidden = after
                .tracks
                .headers()
                .find(|lane| lane.id == clip.track_id)
                .ok_or_else(|| media("missing update lane"))?
                .hidden;
            properties.push(state::property(
                &element,
                "alpha",
                (if hidden { 0_f64 } else { 1_f64 }).to_value(),
            )?);
            if let Some(title) = &clip.title {
                for (key, value) in super::super::title::properties(title, &clip, &after.canvas) {
                    properties.push(state::property(&element, key, value)?);
                }
            } else {
                let dimensions = after
                    .assets
                    .iter()
                    .find(|asset| asset.id == clip.asset_id)
                    .map_or((after.canvas.width, after.canvas.height), |asset| {
                        (asset.width, asset.height)
                    });
                for (key, value) in super::super::preview::geometry_size(
                    dimensions.0,
                    dimensions.1,
                    &clip,
                    &after.canvas,
                ) {
                    properties.push(state::property(&element, key, value.to_value())?);
                }
            }
        }
    }
    if super::super::scoped_pipeline::compiled(pipeline) {
        for track in after.tracks.headers() {
            for stream in [ges::TrackType::VIDEO, ges::TrackType::AUDIO] {
                let name = format!("scope-{}-{}", track.id, stream.bits());
                for source in clips
                    .get(&name)
                    .into_iter()
                    .flatten()
                    .flat_map(|node| node.children(false))
                    .filter_map(|child| child.downcast::<ges::TrackElement>().ok())
                {
                    let property = if source.is::<ges::VideoSource>() {
                        Some(("alpha", if track.hidden { 0_f64 } else { 1_f64 }))
                    } else if source.is::<ges::AudioSource>() {
                        Some(("volume", if track.muted { 0_f64 } else { 1_f64 }))
                    } else {
                        None
                    };
                    if let Some((key, value)) = property {
                        properties.push(state::property(&source, key, value.to_value())?);
                    }
                }
            }
        }
    }
    let decisions = {
        let previous = shared.read().unwrap_or_else(|p| p.into_inner());
        state::decisions_for_plan(after, Some(&previous), plan.as_ref())?
    };
    Ok(Some(ParameterUpdate {
        state: shared,
        decisions,
        properties,
    }))
}
fn same_instance(a: &Instance, b: &Instance) -> bool {
    a.id == b.id
        && a.definition_id == b.definition_id
        && a.definition_version == b.definition_version
}
fn same_header_instance(a: &InstanceHeader, b: &InstanceHeader) -> bool {
    a.id == b.id
        && a.definition_id == b.definition_id
        && a.definition_version == b.definition_version
}
fn same_clip(a: &ClipHeader, b: &ClipHeader) -> bool {
    a.id == b.id
        && a.asset_id == b.asset_id
        && a.track_id == b.track_id
        && a.start_ms == b.start_ms
        && a.source_in_ms == b.source_in_ms
        && a.duration_ms == b.duration_ms
        && a.rate == b.rate
        && a.link_group == b.link_group
        && a.title.is_some() == b.title.is_some()
        && match (&a.generator, &b.generator) {
            (Some(a), Some(b)) => same_header_instance(a, b),
            (None, None) => true,
            _ => false,
        }
        && a.instances.len() == b.instances.len()
        && a.instances
            .iter()
            .zip(&b.instances)
            .all(|(a, b)| same_header_instance(a, b))
}
pub(crate) fn compatible(
    a: &Project,
    b: &Project,
    plan: Option<&super::super::plan_types::RenderPlan>,
) -> Result<bool> {
    let metadata = a.id == b.id
        && a.canvas == b.canvas
        && same_assets(a, b)
        && a.definitions == b.definitions
        && a.transitions.len() == b.transitions.len()
        && a.transitions.iter().zip(&b.transitions).all(|(a, b)| {
            a.from_clip == b.from_clip
                && a.to_clip == b.to_clip
                && a.duration_ms == b.duration_ms
                && a.instance.enabled == b.instance.enabled
                && same_instance(&a.instance, &b.instance)
        })
        && a.tracks.len() == b.tracks.len()
        && a.tracks.headers().zip(b.tracks.headers()).all(|(a, b)| {
            a.id == b.id
                && a.kind == b.kind
                && a.instances.len() == b.instances.len()
                && a.instances
                    .iter()
                    .zip(&b.instances)
                    .all(|(a, b)| same_header_instance(a, b))
        })
        && a.sequence_instances.len() == b.sequence_instances.len()
        && a.sequence_instances
            .iter()
            .zip(&b.sequence_instances)
            .all(|(a, b)| same_instance(a, b))
        && a.clips.len() == b.clips.len()
        && a.clips
            .headers()
            .zip(b.clips.headers())
            .all(|(left, right)| same_clip(left, right));
    if !metadata {
        return Ok(false);
    }
    let before = super::super::pipeline::loaded_clips(a, plan)?;
    let after = super::super::pipeline::loaded_clips(b, plan)?;
    Ok(before.iter().zip(after.iter()).all(|(left, right)| {
        super::legacy::needs_gain(a, left) == super::legacy::needs_gain(b, right)
    }))
}
fn same_assets(a: &Project, b: &Project) -> bool {
    a.assets.len() == b.assets.len()
        && a.assets.iter().zip(&b.assets).all(|(a, b)| {
            a.id == b.id
                && a.path == b.path
                && a.duration_ms == b.duration_ms
                && a.width == b.width
                && a.height == b.height
                && a.has_video == b.has_video
                && a.has_audio == b.has_audio
                && a.is_image == b.is_image
                && a.identity == b.identity
                && a.cursor_mode == b.cursor_mode
                && (std::sync::Arc::ptr_eq(&a.zooms, &b.zooms) || a.zooms == b.zooms)
                && (std::sync::Arc::ptr_eq(&a.cursor, &b.cursor) || a.cursor == b.cursor)
        })
}
