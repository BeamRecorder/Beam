//! Pipeline-local state, released with the graph and atomically replaced after persistence.
use super::types::{
    ClipState, ClipStates, ParameterUpdate, PropertyUpdate, RenderDecisions, RenderState,
    ScopeState, TransitionState,
};
use crate::{Clip, Project, Result, video::pipeline::media};
use beam_editor_domain::timing::Time;
use ges::prelude::*;
use std::sync::{Arc, RwLock};

const STATE_KEY: &str = "beam-editor-render-state-v2";

pub(crate) fn decisions_for_plan(
    project: &Project,
    previous: Option<&RenderDecisions>,
    plan: Option<&super::super::plan_types::RenderPlan>,
) -> Result<RenderDecisions> {
    let tracks: std::collections::HashMap<_, _> =
        project.tracks.headers().map(|t| (t.id, t)).collect();
    let assets: std::collections::HashMap<_, _> =
        project.assets.iter().map(|a| (a.id, a)).collect();
    let mut cursor_indexes: std::collections::HashMap<_, _> = previous
        .into_iter()
        .flat_map(|p| p.values())
        .filter_map(|s| {
            Some((
                (
                    s.asset.as_ref()?.id,
                    serde_json::to_string(&s.cursor_index.as_ref()?.settings).ok()?,
                ),
                s.cursor_index.as_ref()?.clone(),
            ))
        })
        .collect();
    let clips = super::super::pipeline::loaded_clips(project, plan)?
        .into_iter()
        .map(|clip| {
            let lane = tracks
                .get(&clip.track_id)
                .ok_or_else(|| media("render decisions have no lane"))?;
            let asset = assets.get(&clip.asset_id).copied();
            let cursor_style = project
                .recording_style
                .cursor
                .overridden(clip.cursor_style.as_ref());
            let motion_key = serde_json::to_string(&cursor_style.motion)?;
            let cursor_index = asset
                .filter(|a| {
                    a.cursor_mode
                        == beam_editor_domain::recording::style_types::CursorMode::Separated
                })
                .map(|asset| {
                    cursor_indexes
                        .entry((asset.id, motion_key.clone()))
                        .or_insert_with(|| {
                            Arc::new(beam_editor_domain::recording::cursor::prepare(
                                &asset.cursor,
                                &cursor_style,
                            ))
                        })
                        .clone()
                });
            let reusable = previous.and_then(|p| p.get(&clip.id)).filter(|p| {
                (Arc::ptr_eq(&p.clip, &clip)
                    || p.clip
                        .instances
                        .iter()
                        .filter(|i| beam_editor_domain::recording::camera::legacy(i))
                        .eq(clip
                            .instances
                            .iter()
                            .filter(|i| beam_editor_domain::recording::camera::legacy(i))))
                    && p.clip.start_ms == clip.start_ms
                    && p.clip.duration_ms == clip.duration_ms
                    && p.clip.source_in_ms == clip.source_in_ms
                    && p.clip.rate == clip.rate
                    && p.clip.animation_offset_ms == clip.animation_offset_ms
            });
            let mut camera_curves =
                reusable.map_or_else(std::collections::HashMap::new, |p| p.camera_curves.clone());
            for instance in clip.instances.iter().filter(|_| reusable.is_none()) {
                let definition = beam_editor_domain::effects::definition(
                    &project.definitions,
                    &instance.definition_id,
                    instance.definition_version,
                )?;
                if matches!(
                    definition.processor,
                    beam_editor_domain::effects::Processor::CameraZoom
                ) && beam_editor_domain::recording::camera::legacy(instance)
                {
                    let asset =
                        asset.ok_or_else(|| media("camera effect has no recording source"))?;
                    camera_curves.insert(
                        instance.id,
                        Arc::new(beam_editor_domain::recording::camera::compile(
                            asset,
                            &clip,
                            instance.id,
                        )?),
                    );
                }
            }
            Ok((
                clip.id,
                ClipState {
                    clip,
                    hidden: lane.hidden,
                    muted: lane.muted,
                    asset: asset.cloned(),
                    canvas: project.canvas.clone(),
                    recording_style: project.recording_style.clone(),
                    camera_curves,
                    cursor_index,
                },
            ))
        })
        .collect::<Result<ClipStates>>()?;
    let transitions = project
        .transitions
        .iter()
        .filter(|transition| {
            transition.instance.enabled
                && plan.is_none_or(|plan| plan.transitions.contains(&transition.instance.id))
        })
        .map(|transition| {
            let scope =
                beam_editor_domain::effects::transitions::clock(&project.clips, transition)?;
            Ok((
                transition.instance.id,
                TransitionState {
                    transition: transition.clone(),
                    scope,
                },
            ))
        })
        .collect::<Result<_>>()?;
    let mut scopes = std::collections::HashMap::new();
    for header in project
        .tracks
        .headers()
        .filter(|track| !track.instances.is_empty())
    {
        let track = project
            .tracks
            .try_by_id(header.id)?
            .ok_or_else(|| media("scope header has no lane decisions"))?;
        beam_editor_domain::effects::scopes::validate_track(project, &track)?;
        scopes.insert(
            track.id,
            ScopeState {
                instances: track.instances.clone(),
                muted: track.muted,
            },
        );
    }
    if !project.sequence_instances.is_empty() {
        scopes.insert(
            project.id,
            ScopeState {
                instances: project.sequence_instances.clone(),
                muted: false,
            },
        );
    }
    Ok(RenderDecisions {
        clips,
        transitions,
        scopes,
    })
}
pub(crate) fn new_for_plan(
    project: &Project,
    plan: Option<&super::super::plan_types::RenderPlan>,
) -> Result<RenderState> {
    Ok(Arc::new(RwLock::new(decisions_for_plan(
        project, None, plan,
    )?)))
}
pub(crate) fn attach(pipeline: &ges::Pipeline, state: RenderState) {
    // SAFETY: this private key is written exactly once, with this concrete type,
    // before exposing the pipeline. GObject destroys the owned Arc with the graph.
    unsafe {
        pipeline.set_data(STATE_KEY, state);
    }
}
pub(crate) fn get(pipeline: &ges::Pipeline) -> Option<RenderState> {
    // SAFETY: only attach writes this key, and the caller retains the pipeline.
    unsafe {
        pipeline
            .data::<RenderState>(STATE_KEY)
            .map(|state| state.as_ref().clone())
    }
}
/// Effect buffers carry source timestamps. Keep nanosecond precision at this boundary.
pub(crate) fn sequence_time(clip: &Clip, source: gst::ClockTime) -> Result<Time> {
    let source = Time {
        ticks: i64::try_from(source.nseconds())
            .map_err(|_| media("source clock exceeds the exact timestamp budget"))?,
        timescale: 1_000_000_000,
    };
    beam_editor_domain::timing::sequence_time(clip, source)
}

/// An invalid frame cannot reuse the previous frame's effect parameters.
pub(crate) fn probe_result(target: &gst::Element, result: Result<()>) -> gst::PadProbeReturn {
    if let Err(error) = result {
        gst::element_error!(
            target,
            gst::StreamError::Failed,
            ("effect evaluation failed: {error}")
        );
        gst::PadProbeReturn::Drop
    } else {
        gst::PadProbeReturn::Ok
    }
}

pub(crate) fn property(
    element: &ges::TrackElement,
    name: &str,
    value: gst::glib::Value,
) -> Result<PropertyUpdate> {
    let (_, property) = ges::prelude::TimelineElementExt::lookup_child(element, name)
        .ok_or_else(|| media(format!("missing renderer property {name}")))?;
    let value = if value.type_() == property.value_type() {
        value
    } else {
        value
            .transform_with_type(property.value_type())
            .map_err(|error| {
                media(format!(
                    "renderer property {name} has an incompatible type: {error}"
                ))
            })?
    };
    let mut validated = value.clone();
    use gst::glib::translate::{ToGlibPtr, ToGlibPtrMut};
    // SAFETY: both concrete GValues and the retained pspec stay live. The old
    // GLib validation ABI only writes the private clone and reports any change.
    let changed = unsafe {
        gst::glib::gobject_ffi::g_param_value_validate(
            property.to_glib_none().0,
            validated.to_glib_none_mut().0,
        ) != 0
    };
    if changed {
        return Err(media(format!(
            "renderer property {name} is outside its native bounds"
        )));
    }
    Ok(PropertyUpdate {
        element: element.clone(),
        property,
        value,
    })
}

impl ParameterUpdate {
    /// Publish after the project write succeeds. This cannot rebuild or discard a frame.
    pub fn apply(self) {
        let mut state = self.state.write().unwrap_or_else(|p| p.into_inner());
        for update in self.properties {
            ges::prelude::TimelineElementExtManual::set_child_property_by_pspec(
                &update.element,
                update.property,
                update.value,
            );
        }
        *state = self.decisions;
    }
}
