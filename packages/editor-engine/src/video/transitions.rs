//! Actual two-input GES transitions, shared by preview and export.
use super::transition_types::RenderWindow;
use crate::{Clip, Project, Result, TrackKind, video::pipeline::media};
use beam_editor_domain::effects::{Processor, WipeDirection, definition};
use ges::prelude::*;

pub fn window(project: &Project, clip: &Clip) -> Result<RenderWindow> {
    let mut before = 0;
    let mut after = 0;
    let mut start_ms = clip.start_ms;
    for transition in project.transitions.iter().filter(|t| t.instance.enabled) {
        if transition.to_clip == clip.id {
            before = transition.duration_ms.div_ceil(2);
            start_ms = beam_editor_domain::effects::transitions::clock(&project.clips, transition)?
                .start_ms;
        }
        if transition.from_clip == clip.id {
            after = transition.duration_ms / 2;
        }
    }
    Ok(RenderWindow {
        start_ms,
        source_in_ms: clip
            .source_in_ms
            .checked_sub(clip.rate.source_offset(before)?)
            .ok_or_else(|| media("transition has no incoming source handle"))?,
        duration_ms: clip.duration_ms + before + after,
    })
}
pub(crate) fn attach(
    layer: &ges::Layer,
    project: &Project,
    track_id: uuid::Uuid,
    state: &super::effects::types::RenderState,
    plan: Option<&super::plan_types::RenderPlan>,
    streams: ges::TrackType,
) -> Result<()> {
    for transition in project.transitions.iter().filter(|t| {
        t.instance.enabled && plan.is_none_or(|plan| plan.transitions.contains(&t.instance.id))
    }) {
        let from = project
            .clips
            .try_header_by_id(transition.from_clip)?
            .ok_or_else(|| media("missing transition input"))?;
        if from.track_id != track_id {
            continue;
        }
        let to = project
            .clips
            .try_header_by_id(transition.to_clip)?
            .ok_or_else(|| media("missing transition input"))?;
        let definition = definition(
            &project.definitions,
            &transition.instance.definition_id,
            transition.instance.definition_version,
        )?;
        let (kind, inverted) = match definition.processor {
            Processor::Crossfade => (ges::VideoStandardTransitionType::Crossfade, false),
            Processor::TransitionShader { .. } => {
                (ges::VideoStandardTransitionType::BarWipeLr, false)
            }
            Processor::Wipe { direction } => match direction {
                WipeDirection::Left => (ges::VideoStandardTransitionType::BarWipeLr, false),
                WipeDirection::Right => (ges::VideoStandardTransitionType::BarWipeLr, true),
                WipeDirection::Up => (ges::VideoStandardTransitionType::BarWipeTb, false),
                WipeDirection::Down => (ges::VideoStandardTransitionType::BarWipeTb, true),
            },
            _ => {
                return Err(media(
                    "the native backend cannot render this two-input processor",
                ));
            }
        };
        let node = ges::TransitionClip::new(kind)
            .ok_or_else(|| media("GES could not create the two-input transition"))?;
        node.set_name(Some(&format!("transition-{}", transition.instance.id)))
            .map_err(media)?;
        let lane = project
            .tracks
            .try_header_by_id(track_id)?
            .ok_or_else(|| media("missing transition lane"))?;
        let has_audio = |clip: &beam_editor_domain::collections::headers::ClipHeader| {
            project
                .assets
                .iter()
                .any(|a| a.id == clip.asset_id && a.has_audio)
        };
        let formats = if lane.kind == TrackKind::Audio {
            ges::TrackType::AUDIO
        } else if has_audio(from)
            && has_audio(to)
            && !super::pipeline::audio_group_separated(project, from.id, from.link_group)
            && !super::pipeline::audio_group_separated(project, to.id, to.link_group)
        {
            ges::TrackType::VIDEO | ges::TrackType::AUDIO
        } else {
            ges::TrackType::VIDEO
        };
        let formats = formats & streams;
        if formats.is_empty() {
            continue;
        }
        node.set_supported_formats(formats);
        if !node.set_start(gst::ClockTime::from_mseconds(
            beam_editor_domain::effects::transitions::clock(&project.clips, transition)?.start_ms,
        )) || !node.set_duration(gst::ClockTime::from_mseconds(transition.duration_ms))
        {
            return Err(media("GES rejected transition timing"));
        }
        layer.add_clip(&node).map_err(media)?;
        if matches!(definition.processor, Processor::Wipe { .. }) {
            node.set_child_property("invert", inverted.to_value())
                .map_err(media)?;
        }
        for child in node.children(false) {
            if let Ok(element) = child.downcast::<ges::TrackElement>()
                && element.is::<ges::VideoTransition>()
            {
                super::gpu::transition::configure(
                    &element,
                    &definition.processor,
                    state.clone(),
                    transition.instance.id,
                )?;
            }
        }
    }
    Ok(())
}
