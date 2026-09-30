//! Real cursor artwork is composited in source space without mapping captured video.
use super::super::effects::{state::sequence_time, types::RenderState};
use super::{cursor_catalog, cursor_overlay, cursor_raster};
use crate::{MediaAsset, Result, video::pipeline::media};
use beam_editor_domain::{effects::Instance, recording::style_types::CursorMode, timing::Time};
use ges::prelude::*;
use uuid::Uuid;

pub(crate) fn effect(
    asset: &MediaAsset,
    shared: RenderState,
    clip_id: Uuid,
    instance_id: Option<Uuid>,
) -> Result<ges::Effect> {
    validate(asset)?;
    let catalogue = cursor_catalog::packs()?;
    let effect = ges::Effect::new("video glupload name=beam_gpu_input ! glcolorconvert ! overlaycomposition name=beam_recording ! gloverlaycompositor ! video/x-raw(memory:GLMemory),format=RGBA ! identity name=beam_gpu_output").map_err(media)?;
    super::super::gpu::meta::preserve(&effect)?;
    let compositor = super::target(&effect)?;
    let weak = compositor.downgrade();
    compositor.connect("draw", false, move |values| {
        let Some(compositor) = weak.upgrade() else {
            return Some(Option::<gst_video::VideoOverlayComposition>::None.to_value());
        };
        let decision = (|| -> Result<Option<gst_video::VideoOverlayComposition>> {
            let sample = values[1].get::<gst::Sample>().map_err(media)?;
            let buffer = sample
                .buffer()
                .ok_or_else(|| media("cursor has no source buffer"))?;
            let pts = buffer
                .pts()
                .ok_or_else(|| media("cursor buffer has no source timestamp"))?;
            let states = shared.read().unwrap_or_else(|p| p.into_inner());
            let state = states
                .get(&clip_id)
                .ok_or_else(|| media("cursor clip is missing from render state"))?;
            let asset = state
                .asset
                .as_ref()
                .ok_or_else(|| media("cursor source is missing from render state"))?;
            let style = state
                .recording_style
                .cursor
                .overridden(state.clip.cursor_style.as_ref());
            let time = sequence_time(&state.clip, pts)?;
            let instance =
                instance_id.and_then(|id| state.clip.instances.iter().find(|i| i.id == id));
            if let Some(id) = instance_id {
                let instance =
                    instance.ok_or_else(|| media(format!("cursor instance {id} is missing")))?;
                if !instance.active(&state.clip, time)? {
                    return Ok(None);
                }
            }
            let index = state
                .cursor_index
                .as_ref()
                .ok_or_else(|| media("cursor index was not prepared"))?;
            let source = beam_editor_domain::timing::map_time(
                &state.clip,
                time,
                beam_editor_domain::timing::TimeSpace::Source,
            )?
            .seconds()
                * 1000.;
            let sample = beam_editor_domain::recording::cursor::source_at_prepared(
                &asset.cursor,
                index,
                &style,
                source,
            );
            let Some(sample) = sample.filter(|p| p.opacity > 0.) else {
                return Ok(None);
            };
            let point = asset
                .cursor
                .partition_point(|p| p.time_ms as f64 <= source)
                .checked_sub(1)
                .and_then(|i| asset.cursor.get(i));
            let pack = catalogue
                .iter()
                .find(|p| p.id == style.selection.pack_id)
                .ok_or_else(|| {
                    media(format!(
                        "cursor pack {} is unavailable",
                        style.selection.pack_id
                    ))
                })?;
            let sprite =
                cursor_raster::sprite(pack, &style, point.and_then(|p| p.cursor_type.as_deref()))?;
            let opacity = sample.opacity * parameter(instance, &state.clip, "opacity", time, 1.)?;
            let size = parameter(instance, &state.clip, "sizeScale", time, 1.)?;
            let click_opacity = parameter(instance, &state.clip, "clickOpacity", time, 1.)?;
            let rectangles = cursor_overlay::rectangles(
                asset,
                index,
                &style,
                &sprite,
                source,
                sample,
                opacity,
                size,
                click_opacity,
            )?;
            if rectangles.is_empty() {
                Ok(None)
            } else {
                gst_video::VideoOverlayComposition::new(&rectangles)
                    .map(Some)
                    .map_err(media)
            }
        })();
        let composition = match decision {
            Ok(composition) => composition,
            Err(error) => {
                super::super::effects::state::probe_result(&compositor, Err(error));
                None
            }
        };
        Some(composition.to_value())
    });
    Ok(effect)
}
fn validate(asset: &MediaAsset) -> Result<()> {
    if asset.cursor_mode != CursorMode::Separated {
        return Err(media(match asset.cursor_mode {
            CursorMode::BakedIn => {
                "cursor is already baked into this source; overlay would draw it twice"
            }
            CursorMode::Absent => "source has no separated cursor telemetry",
            CursorMode::Unknown => {
                "source cursor mode is unknown; relink or import with explicit cursor metadata"
            }
            CursorMode::Separated => unreachable!(),
        }));
    }
    if asset.cursor.is_empty() {
        return Err(media(
            "separated cursor source contains no captured positions",
        ));
    }
    Ok(())
}

fn parameter(
    instance: Option<&Instance>,
    clip: &crate::Clip,
    key: &str,
    time: Time,
    default: f64,
) -> Result<f64> {
    let Some(instance) = instance else {
        return Ok(default);
    };
    instance
        .parameters
        .get(key)
        .ok_or_else(|| media(format!("missing cursor parameter {key}")))?
        .at_sequence(clip, time)?
        .number()
        .ok_or_else(|| media(format!("cursor parameter {key} must be numeric")))
}
