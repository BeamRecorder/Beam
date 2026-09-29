//! One GES timeline contract for native preview and export.
pub use super::effects::types::ParameterUpdate;
use crate::{EditorError, Project, Result, TrackKind};
use ges::prelude::*;
use std::path::Path;

/// Validate a live update without publishing parameters before the durable write.
pub fn prepare_update(
    pipeline: &ges::Pipeline,
    before: &Project,
    after: &Project,
) -> Result<Option<ParameterUpdate>> {
    if !super::scoped_pipeline::compiled(pipeline) {
        super::scopes::validate_native(after)?;
    }
    super::effects::update::prepare(pipeline, before, after)
}
/// Library convenience; hosts with persistence use prepare_update then apply.
pub fn update(pipeline: &ges::Pipeline, before: &Project, after: &Project) -> Result<bool> {
    let Some(update) = prepare_update(pipeline, before, after)? else {
        return Ok(false);
    };
    update.apply();
    Ok(true)
}

/// Builds a GES composition. Higher lanes paint above lower ones; audio is mixed by GES.
pub fn build(root: &Path, project: &Project) -> Result<ges::Pipeline> {
    build_with_source_reuse(root, project, true)
}

/// Source reuse is an allocation policy; disabling it preserves explicit native cuts.
pub fn build_with_source_reuse(
    root: &Path,
    project: &Project,
    reuse: bool,
) -> Result<ges::Pipeline> {
    build_selected(root, project, None, reuse)
}

/// Preload the playhead's sources. The document and native clocks stay absolute.
pub fn build_preview(root: &Path, project: &Project, position_ms: u64) -> Result<ges::Pipeline> {
    build_preview_with_policy(
        root,
        project,
        position_ms,
        super::plan_types::PreviewWindow::default(),
    )
}
pub fn build_preview_with_policy(
    root: &Path,
    project: &Project,
    position_ms: u64,
    policy: super::plan_types::PreviewWindow,
) -> Result<ges::Pipeline> {
    let plan = super::plan_types::RenderPlan::preview_with_policy(project, position_ms, policy)?;
    build_selected(root, project, Some(plan), true)
}

/// Export segments use the same graph decisions and two-input source handles.
pub fn build_window(
    root: &Path,
    project: &Project,
    start_ms: u64,
    end_ms: u64,
) -> Result<ges::Pipeline> {
    let plan = super::plan_types::RenderPlan::range(project, start_ms, end_ms)?;
    build_selected(root, project, Some(plan), true)
}

pub fn contains_position(pipeline: &ges::Pipeline, position_ms: u64) -> bool {
    super::plan::get(pipeline).is_none_or(|plan| plan.contains_position(position_ms))
}

pub fn render_plan(pipeline: &ges::Pipeline) -> Option<super::plan_types::RenderPlan> {
    super::plan::get(pipeline)
}

/// A native composition owns its media graph without a playback pipeline.
pub fn compose(root: &Path, project: &Project) -> Result<ges::Timeline> {
    super::scopes::validate_native(project)?;
    let selected = project.clips.headers().map(|clip| clip.id).collect();
    crate::project::validation::render(project, &selected)?;
    super::gpu::initialize()?;
    let state = super::effects::state::new_for_plan(project, None)?;
    Ok(timeline_for(root, project, None, true, &state, None)?.0)
}

fn build_selected(
    root: &Path,
    project: &Project,
    plan: Option<super::plan_types::RenderPlan>,
    reuse: bool,
) -> Result<ges::Pipeline> {
    super::scopes::validate_native(project)?;
    let selected: std::collections::HashSet<_> = plan.as_ref().map_or_else(
        || project.clips.headers().map(|clip| clip.id).collect(),
        |plan| plan.clips.clone(),
    );
    crate::project::validation::render(project, &selected)?;
    super::gpu::initialize()?;
    let state = super::effects::state::new_for_plan(project, plan.as_ref())?;
    let (timeline, native_count, reused) =
        timeline_for(root, project, plan.as_ref(), reuse, &state, None)?;
    let pipeline = ges::Pipeline::new();
    pipeline.set_timeline(&timeline).map_err(media)?;
    super::audio_clock::configure(&pipeline)?;
    super::gpu::configure(&pipeline);
    super::seek::configure(&pipeline);
    super::effects::state::attach(&pipeline, state);
    super::source_runs::attach(&pipeline, native_count, reused);
    if let Some(plan) = plan {
        super::plan::attach(&pipeline, plan);
    }
    Ok(pipeline)
}

pub(crate) fn timeline_for(
    root: &Path,
    project: &Project,
    plan: Option<&super::plan_types::RenderPlan>,
    reuse: bool,
    state: &super::effects::types::RenderState,
    selection: Option<super::composition_types::CompositionSelection>,
) -> Result<(ges::Timeline, usize, bool)> {
    let streams = selection.map_or_else(
        || {
            if has_audio(project) {
                ges::TrackType::VIDEO | ges::TrackType::AUDIO
            } else {
                ges::TrackType::VIDEO
            }
        },
        |selection| selection.stream,
    );
    let timeline = super::composition::new(project, streams, true)?;
    let assets: std::collections::HashMap<_, _> = project
        .assets
        .iter()
        .map(|asset| (asset.id, asset))
        .collect();
    let mut lanes: std::collections::HashMap<_, Vec<_>> = std::collections::HashMap::new();
    for clip in loaded_clips(project, plan)?
        .into_iter()
        .filter(|clip| selection.is_none_or(|selection| clip.track_id == selection.lane))
    {
        lanes.entry(clip.track_id).or_default().push(clip);
    }
    let mut native_count = 0;
    let mut reused = false;
    for lane in project
        .tracks
        .headers()
        .filter(|lane| selection.is_none_or(|selection| lane.id == selection.lane))
    {
        let layer = timeline.append_layer();
        let runs = super::source_runs::compile(
            project,
            lanes.remove(&lane.id).unwrap_or_default(),
            reuse,
        )?;
        for run in runs {
            reused |= run.logical_ids.len() > 1;
            let clip = &run.first;
            let asset = assets.get(&clip.asset_id).copied();
            let formats = if lane.kind == TrackKind::Audio {
                ges::TrackType::AUDIO
            } else if asset.is_some_and(|asset| asset.has_audio) && !audio_separated(project, clip)
            {
                ges::TrackType::VIDEO | ges::TrackType::AUDIO
            } else {
                ges::TrackType::VIDEO
            } & streams;
            if formats.is_empty() {
                continue;
            }
            native_count += 1;
            let node: ges::Clip = if clip.title.is_some() {
                ges::TitleClip::new()
                    .ok_or_else(|| media("GES could not create a title"))?
                    .upcast()
            } else if clip.generator.is_some() {
                let source = ges::TestClip::new()
                    .ok_or_else(|| media("GES could not create the generator source"))?;
                source.set_vpattern(ges::VideoTestPattern::SolidColor);
                source.upcast()
            } else {
                let asset = asset.ok_or_else(|| EditorError::Invalid("missing source".into()))?;
                crate::project::sources::verify(root, asset)?;
                let path = crate::project::validation::source_path(root, &asset.path)?;
                let source = load_source(&super::probe::uri(&path)?)?
                    .extract()
                    .map_err(media)?
                    .downcast::<ges::UriClip>()
                    .map_err(|_| media("asset did not create a URI clip"))?;
                source.set_is_image(asset.is_image);
                source.upcast()
            };
            node.set_name(Some(&format!("clip-{}", clip.id)))
                .map_err(media)?;
            node.set_supported_formats(formats);
            let mut window = super::transitions::window(project, clip)?;
            window.duration_ms += run.duration_ms - clip.duration_ms;
            if !node.set_start(gst::ClockTime::from_mseconds(window.start_ms))
                || !node.set_inpoint(gst::ClockTime::from_mseconds(window.source_in_ms))
                || !node.set_duration(gst::ClockTime::from_mseconds(window.duration_ms))
            {
                return Err(EditorError::Media("GES rejected clip timing".into()));
            }
            layer.add_clip(&node).map_err(media)?;
            super::effects::attach(&node, clip, project, state)?;
            super::retime::attach(&node, clip)?;
            if clip.rate.numerator != clip.rate.denominator
                && !node.set_duration(gst::ClockTime::from_mseconds(window.duration_ms))
            {
                return Err(media("GES rejected the rate-mapped clip duration"));
            }
            for child in node.children(false) {
                let Ok(element) = child.downcast::<ges::TrackElement>() else {
                    continue;
                };
                if element.is::<ges::VideoSource>() {
                    ges::prelude::TimelineElementExtManual::set_child_property(
                        &element,
                        "alpha",
                        (if lane.hidden { 0_f64 } else { 1_f64 }).to_value(),
                    )
                    .map_err(media)?;
                    super::gpu::source::configure(&element)?;
                    if let Some(title) = &clip.title {
                        super::title::configure(&element, title, clip, &project.canvas)?;
                    } else if let Some(asset) = asset {
                        super::preview::configure_geometry(&element, asset, clip, &project.canvas)?;
                    } else {
                        for (key, value) in super::preview::geometry_size(
                            project.canvas.width,
                            project.canvas.height,
                            clip,
                            &project.canvas,
                        ) {
                            ges::prelude::TimelineElementExtManual::set_child_property(
                                &element,
                                key,
                                value.to_value(),
                            )
                            .map_err(media)?;
                        }
                    }
                } else if element.is::<ges::AudioSource>() {
                    ges::prelude::TimelineElementExtManual::set_child_property(
                        &element,
                        "volume",
                        1_f64.to_value(),
                    )
                    .map_err(media)?;
                }
            }
        }
        super::transitions::attach(&layer, project, lane.id, state, plan, streams)?;
    }
    if project.duration_ms() > 0 && streams.contains(ges::TrackType::VIDEO) {
        super::composition::background(
            &timeline,
            project,
            if selection.is_some() {
                0
            } else {
                project.canvas.background
            },
        )?;
    }
    if project.duration_ms() > 0 && selection.is_some() && streams.contains(ges::TrackType::AUDIO) {
        super::composition::silence(&timeline, project)?;
    }
    if !timeline.commit_sync() {
        return Err(EditorError::Media(
            "GES could not commit the composition".into(),
        ));
    }
    Ok((timeline, native_count, reused))
}

/// Turns media-library errors into actionable native editor errors.
pub(crate) fn media(error: impl std::fmt::Display) -> EditorError {
    EditorError::Media(error.to_string())
}

/// Empty audio tracks synthesize silence in GES and require a sink even for video-only media.
pub(crate) fn has_audio(project: &Project) -> bool {
    let audio_processor = |id: &str, version| {
        project.definitions.iter().any(|definition| {
            definition.id == id
                && definition.version == version
                && definition.domain == beam_editor_domain::effects::Domain::Audio
        })
    };
    if project
        .sequence_instances
        .iter()
        .any(|instance| audio_processor(&instance.definition_id, instance.definition_version))
        || project.tracks.headers().any(|track| {
            track.instances.iter().any(|instance| {
                audio_processor(&instance.definition_id, instance.definition_version)
            })
        })
    {
        return true;
    }
    let assets: std::collections::HashSet<_> = project
        .assets
        .iter()
        .filter(|a| a.has_audio)
        .map(|a| a.id)
        .collect();
    project
        .clips
        .headers()
        .any(|clip| assets.contains(&clip.asset_id))
}

/// A linked audio lane owns the group's soundtrack, including preview and export.
pub(crate) fn audio_separated(project: &Project, clip: &crate::Clip) -> bool {
    audio_group_separated(project, clip.id, clip.link_group)
}
pub(crate) fn audio_group_separated(
    project: &Project,
    clip_id: uuid::Uuid,
    link_group: Option<uuid::Uuid>,
) -> bool {
    link_group.is_some_and(|group| {
        project.clips.headers().any(|other| {
            other.id != clip_id
                && other.link_group == Some(group)
                && project
                    .tracks
                    .headers()
                    .any(|lane| lane.id == other.track_id && lane.kind == TrackKind::Audio)
        })
    })
}

/// Headers select media without loading unrelated effect payloads.
pub(crate) fn loaded_clips(
    project: &Project,
    plan: Option<&super::plan_types::RenderPlan>,
) -> Result<Vec<std::sync::Arc<crate::Clip>>> {
    project
        .clips
        .headers()
        .filter(|clip| plan.is_none_or(|plan| plan.clips.contains(&clip.id)))
        .map(|clip| {
            project
                .clips
                .try_by_id(clip.id)?
                .ok_or_else(|| media("render header has no clip decisions"))
        })
        .collect()
}

/// The synchronous GES URI helper drives the global main loop. Drive discovery
/// on the actor's context instead, including a deadline for broken sources.
fn load_source(uri: &str) -> Result<ges::Asset> {
    use futures_util::future::{Either, select};
    gst::glib::MainContext::ref_thread_default().block_on(async {
        let request = ges::Asset::request_future::<ges::UriClip>(Some(uri));
        let timeout = Box::pin(gst::glib::timeout_future_seconds(15));
        match select(request, timeout).await {
            Either::Left((result, _)) => result.map_err(media),
            Either::Right(_) => Err(EditorError::Media(
                "source discovery exceeded 15 seconds".into(),
            )),
        }
    })
}
