//! Real recording processors use the same prepared decisions in preview and export.
pub mod camera;
pub mod cursor;
use super::effects::types::RenderState;
use crate::{Clip, MediaAsset, Project, Result, video::pipeline::media};
use beam_editor_domain::{effects::Processor, recording::style_types::CursorMode};
use ges::prelude::*;
use uuid::Uuid;

pub(crate) fn effect(
    processor: &Processor,
    asset: &MediaAsset,
    shared: RenderState,
    clip_id: Uuid,
    instance_id: Uuid,
) -> Result<ges::Effect> {
    match processor {
        Processor::CameraZoom => camera::effect(shared, clip_id, instance_id),
        Processor::Cursor => cursor::effect(asset, shared, clip_id, Some(instance_id)),
        _ => Err(media("this definition is not a recording processor")),
    }
}

/// The inherited cursor sits in source space before any camera or framing processor.
pub(crate) fn attach_cursor(
    node: &ges::Clip,
    clip: &Clip,
    project: &Project,
    shared: &RenderState,
) -> Result<()> {
    if !node.supported_formats().contains(ges::TrackType::VIDEO)
        || clip.instances.iter().any(|instance| {
            project.definitions.iter().any(|definition| {
                definition.id == instance.definition_id
                    && definition.version == instance.definition_version
                    && definition.processor == Processor::Cursor
            })
        })
    {
        return Ok(());
    }
    let Some(asset) = project
        .assets
        .iter()
        .find(|asset| asset.id == clip.asset_id)
    else {
        return Ok(());
    };
    if asset.cursor_mode != CursorMode::Separated || asset.cursor.is_empty() {
        return Ok(());
    }
    let overlay = cursor::effect(asset, shared.clone(), clip.id, None)?;
    node.add_top_effect(&overlay, 0).map_err(media)
}

/// Missing optional cursor telemetry must not make the captured video unavailable.
pub(crate) fn warnings(project: &Project) -> Vec<String> {
    project.assets.iter().filter(|asset| {
        asset.cursor_mode == CursorMode::Separated && asset.cursor.is_empty()
    }).map(|asset| format!(
        "{}: cursor positions were not captured. Video is available without a cursor overlay.",
        asset.name
    )).collect()
}

pub(crate) fn target(effect: &ges::Effect) -> Result<gst::Element> {
    effect
        .element()
        .and_then(|e| e.downcast::<gst::Bin>().ok())
        .and_then(|bin| bin.by_name("beam_recording"))
        .ok_or_else(|| media("recording effect has no GPU processor"))
}
