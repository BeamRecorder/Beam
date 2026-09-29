//! Text positions are applied before Pango rasterization, including paused seeks.
use super::{state::sequence_time, types::RenderState};
use crate::{Clip, Project, Result, video::pipeline::media};
use beam_editor_domain::effects::{Processor, definition, placement};
use ges::prelude::*;
use std::collections::HashSet;
use uuid::Uuid;

const IDS_KEY: &str = "beam-editor-text-placement-instances-v1";

pub(crate) fn attach(
    node: &ges::Clip,
    clip: &Clip,
    project: &Project,
    shared: &RenderState,
) -> Result<()> {
    let layouts = project
        .definitions
        .iter()
        .filter(|d| matches!(d.processor, Processor::TextPlacement))
        .map(|d| (d.id.clone(), d.version))
        .collect::<HashSet<_>>();
    if !clip
        .instances
        .iter()
        .any(|i| layouts.contains(&(i.definition_id.clone(), i.definition_version)))
    {
        return Ok(());
    }
    for instance in &clip.instances {
        placement::compatible(
            &definition(
                &project.definitions,
                &instance.definition_id,
                instance.definition_version,
            )?
            .processor,
            clip,
        )?;
    }
    let source = node
        .children(false)
        .into_iter()
        .filter_map(|c| c.downcast::<ges::TrackElement>().ok())
        .find(|e| e.is::<ges::VideoSource>())
        .ok_or_else(|| media("text placement has no native video source"))?;
    let bin = source
        .element()
        .and_then(|e| e.downcast::<gst::Bin>().ok())
        .ok_or_else(|| media("native title source has no element bin"))?;
    let mut target = None;
    for element in bin.iterate_recurse().into_iter() {
        let element = element.map_err(media)?;
        if element.factory().is_some_and(|f| f.name() == "textoverlay") {
            target = Some(element);
            break;
        }
    }
    let target = target.ok_or_else(|| media("native title source has no Pango text overlay"))?;
    if target.find_property("xpos").is_none() || target.find_property("ypos").is_none() {
        return Err(media("native text overlay has no position properties"));
    }
    let weak = target.downgrade();
    let shared = shared.clone();
    let clip_id = clip.id;
    target
        .static_pad("video_sink")
        .ok_or_else(|| media("Pango text overlay has no video input"))?
        .add_probe(gst::PadProbeType::BUFFER, move |_, info| {
            let Some(target) = weak.upgrade() else {
                return gst::PadProbeReturn::Ok;
            };
            let decision = (|| -> Result<(f64, f64)> {
                let pts = info
                    .buffer()
                    .and_then(|b| b.pts())
                    .ok_or_else(|| media("title buffer has no source timestamp"))?;
                let states = shared.read().unwrap_or_else(|p| p.into_inner());
                let state = states
                    .get(&clip_id)
                    .ok_or_else(|| media("title clip is missing from the render state"))?;
                let time = sequence_time(&state.clip, pts)?;
                let mut position = (state.clip.effects.x, state.clip.effects.y);
                for instance in &state.clip.instances {
                    if layouts
                        .contains(&(instance.definition_id.clone(), instance.definition_version))
                        && instance.active(&state.clip, time)?
                    {
                        position = (
                            placement::number(instance, &state.clip, "x", time)?,
                            placement::number(instance, &state.clip, "y", time)?,
                        );
                    }
                }
                Ok(position)
            })();
            match decision {
                Ok((x, y)) => target.set_properties(&[("xpos", &x), ("ypos", &y)]),
                Err(error) => {
                    gst::element_error!(
                        target,
                        gst::StreamError::Failed,
                        ("text placement failed: {error}")
                    );
                    return gst::PadProbeReturn::Drop;
                }
            }
            gst::PadProbeReturn::Ok
        });
    let ids = clip
        .instances
        .iter()
        .filter(|instance| {
            project.definitions.iter().any(|definition| {
                definition.id == instance.definition_id
                    && definition.version == instance.definition_version
                    && matches!(definition.processor, Processor::TextPlacement)
            })
        })
        .map(|instance| instance.id)
        .collect::<Vec<_>>();
    // SAFETY: this private diagnostic key has one writer and one exact value type.
    unsafe { node.set_data(IDS_KEY, ids) };
    Ok(())
}

pub(crate) fn identities(node: &ges::Clip) -> Vec<Uuid> {
    // SAFETY: attach stores this exact type; the caller retains the native clip.
    unsafe {
        node.data::<Vec<Uuid>>(IDS_KEY)
            .map(|ids| ids.as_ref().clone())
            .unwrap_or_default()
    }
}
