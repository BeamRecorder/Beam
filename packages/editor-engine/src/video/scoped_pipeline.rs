//! Mix clips within native lanes, process lanes, mix them, then process the sequence.
use super::{
    composition,
    composition_types::CompositionSelection,
    effects::{scoped, state, types::RenderState},
    pipeline::media,
};
use crate::{Project, Result, TrackKind};
use beam_editor_domain::effects::Instance;
use ges::prelude::*;
use uuid::Uuid;

const KEY: &str = "beam-native-scopes-compiled-v1";

/// Experimental entry until video/audio and parameter publication proofs pass.
pub fn build(root: &std::path::Path, project: &Project) -> Result<ges::Pipeline> {
    build_with_source_reuse(root, project, true)
}
/// Disabling decoder reuse keeps each logical cut as a distinct native source.
pub fn build_with_source_reuse(
    root: &std::path::Path,
    project: &Project,
    reuse: bool,
) -> Result<ges::Pipeline> {
    build_for_plan(root, project, None, reuse)
}
/// Experimental windowed entry used by the same strict raw export handoff.
pub fn build_window(
    root: &std::path::Path,
    project: &Project,
    start_ms: u64,
    end_ms: u64,
) -> Result<ges::Pipeline> {
    let plan = super::plan_types::RenderPlan::range(project, start_ms, end_ms)?;
    build_for_plan(root, project, Some(plan), true)
}
fn build_for_plan(
    root: &std::path::Path,
    project: &Project,
    plan: Option<super::plan_types::RenderPlan>,
    reuse: bool,
) -> Result<ges::Pipeline> {
    let selected = plan.as_ref().map_or_else(
        || project.clips.headers().map(|clip| clip.id).collect(),
        |plan| plan.clips.clone(),
    );
    crate::project::validation::render(project, &selected)?;
    super::gpu::initialize()?;
    let state = state::new_for_plan(project, plan.as_ref())?;
    let mut streams = ges::TrackType::VIDEO;
    if super::pipeline::has_audio(project) {
        streams |= ges::TrackType::AUDIO;
    }
    let (timeline, count, reused) = timeline(root, project, plan.as_ref(), reuse, &state, streams)?;
    let pipeline = ges::Pipeline::new();
    pipeline.set_timeline(&timeline).map_err(media)?;
    super::audio_clock::configure(&pipeline)?;
    super::gpu::configure(&pipeline);
    super::seek::configure(&pipeline);
    state::attach(&pipeline, state);
    super::source_runs::attach(&pipeline, count, reused);
    // SAFETY: one private concrete marker, written before graph publication.
    unsafe {
        pipeline.set_data(KEY, true);
    }
    if let Some(plan) = plan {
        super::plan::attach(&pipeline, plan);
    }
    Ok(pipeline)
}
pub(crate) fn compiled(pipeline: &ges::Pipeline) -> bool {
    // SAFETY: only build writes the marker; the caller retains the pipeline.
    unsafe {
        pipeline
            .data::<bool>(KEY)
            .is_some_and(|value| *value.as_ref())
    }
}

pub(crate) fn timeline(
    root: &std::path::Path,
    project: &Project,
    plan: Option<&super::plan_types::RenderPlan>,
    reuse: bool,
    state: &RenderState,
    streams: ges::TrackType,
) -> Result<(ges::Timeline, usize, bool)> {
    let output = composition::new(project, streams, false)?;
    let mut count = 0;
    let mut reused = false;
    for stream in [ges::TrackType::VIDEO, ges::TrackType::AUDIO]
        .into_iter()
        .filter(|stream| streams.contains(*stream))
    {
        let group = composition::new(project, stream, true)?;
        for lane in project.tracks.headers() {
            let relevant = project.clips.headers().any(|clip| {
                clip.track_id == lane.id
                    && plan.is_none_or(|plan| plan.clips.contains(&clip.id))
                    && if stream == ges::TrackType::VIDEO {
                        lane.kind != TrackKind::Audio
                    } else {
                        project
                            .assets
                            .iter()
                            .any(|asset| asset.id == clip.asset_id && asset.has_audio)
                            && (lane.kind == TrackKind::Audio
                                || !super::pipeline::audio_group_separated(
                                    project,
                                    clip.id,
                                    clip.link_group,
                                ))
                    }
            });
            let has_processor = lane.instances.iter().any(|instance| {
                project.definitions.iter().any(|definition| {
                    definition.id == instance.definition_id
                        && definition.version == instance.definition_version
                        && if stream == ges::TrackType::VIDEO {
                            lane.kind != TrackKind::Audio
                                && definition.domain == beam_editor_domain::effects::Domain::Video
                        } else {
                            definition.domain == beam_editor_domain::effects::Domain::Audio
                        }
                })
            });
            if !relevant && !has_processor {
                continue;
            }
            let selection = CompositionSelection {
                lane: lane.id,
                stream,
            };
            let (input, sources, was_reused) =
                super::pipeline::timeline_for(root, project, plan, reuse, state, Some(selection))?;
            count += sources;
            reused |= was_reused;
            let track = if lane.instances.is_empty() {
                None
            } else {
                project.tracks.try_by_id(lane.id)?
            };
            let node = add(
                &group,
                project,
                &input,
                lane.id,
                track.as_ref().map_or(&[], |track| &track.instances),
                state,
                stream,
            )?;
            for child in node.children(false) {
                let Ok(source) = child.downcast::<ges::TrackElement>() else {
                    continue;
                };
                if source.is::<ges::VideoSource>() {
                    ges::prelude::TimelineElementExtManual::set_child_property(
                        &source,
                        "alpha",
                        (if lane.hidden { 0_f64 } else { 1_f64 }).to_value(),
                    )
                    .map_err(media)?;
                } else if source.is::<ges::AudioSource>() {
                    ges::prelude::TimelineElementExtManual::set_child_property(
                        &source,
                        "volume",
                        (if lane.muted { 0_f64 } else { 1_f64 }).to_value(),
                    )
                    .map_err(media)?;
                }
            }
        }
        if stream == ges::TrackType::VIDEO {
            composition::background(&group, project, project.canvas.background)?;
        } else {
            composition::silence(&group, project)?;
        }
        if !group.commit_sync() {
            return Err(media("GES rejected the lane mix"));
        }
        add(
            &output,
            project,
            &group,
            project.id,
            &project.sequence_instances,
            state,
            stream,
        )?;
    }
    if !output.commit_sync() {
        return Err(media("GES rejected the final sequence"));
    }
    Ok((output, count, reused))
}
fn add(
    timeline: &ges::Timeline,
    project: &Project,
    input: &ges::Timeline,
    scope_id: Uuid,
    instances: &[Instance],
    state: &RenderState,
    stream: ges::TrackType,
) -> Result<ges::Clip> {
    let node = composition::source(project)?;
    node.set_name(Some(&format!("scope-{scope_id}-{}", stream.bits())))
        .map_err(media)?;
    node.set_supported_formats(stream);
    if !node.set_duration(gst::ClockTime::from_mseconds(project.duration_ms())) {
        return Err(media("GES rejected scope duration"));
    }
    timeline.append_layer().add_clip(&node).map_err(media)?;
    for child in node.children(false) {
        let Ok(source) = child.downcast::<ges::TrackElement>() else {
            continue;
        };
        if source.is::<ges::VideoSource>() {
            super::scopes::video_source(&source, input)?;
            composition::geometry(&source, project)?;
        } else if source.is::<ges::AudioSource>() {
            super::scopes::audio_source(&source, input)?;
            ges::prelude::TimelineElementExtManual::set_child_property(
                &source,
                "volume",
                1_f64.to_value(),
            )
            .map_err(media)?;
        }
    }
    scoped::attach(node.upcast_ref(), scope_id, instances, project, state)?;
    Ok(node.upcast())
}

pub(crate) fn nodes(pipeline: &ges::Pipeline) -> Vec<ges::Clip> {
    pipeline
        .iterate_recurse()
        .into_iter()
        .flatten()
        .filter_map(|element| element.downcast::<ges::Timeline>().ok())
        .flat_map(|timeline| timeline.layers())
        .flat_map(|layer| layer.clips())
        .collect()
}
