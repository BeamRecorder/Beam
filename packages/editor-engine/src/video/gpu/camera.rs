//! Constant-size GPU camera animation, evaluated in immutable source time.
//! Animating GES width/height renegotiates source caps while NLE switches clips.
use crate::{
    MediaAsset, Result,
    video::{
        pipeline::media,
        zoom::types::{Camera, CameraKey},
    },
};
use ges::prelude::*;
use std::sync::Arc;

/// Keeps the image dimensions stable while GStreamer draws zoom and pan on the GPU.
pub fn effect(asset: &MediaAsset) -> Result<ges::Effect> {
    let keys = Arc::new(crate::video::zoom::control::compile(asset)?);
    let effect = ges::Effect::new("glupload name=beam_gpu_input ! glcolorconvert ! gltransformation name=beam_camera ortho=true ! identity name=beam_gpu_output")
        .map_err(media)?;
    let bin = effect
        .element()
        .ok_or_else(|| media("missing camera effect"))?
        .downcast::<gst::Bin>()
        .map_err(|_| media("invalid camera effect bin"))?;
    let transform = bin
        .by_name("beam_camera")
        .ok_or_else(|| media("missing GPU camera"))?;
    let weak = transform.downgrade();
    transform
        .static_pad("sink")
        .ok_or_else(|| media("missing camera input"))?
        .add_probe(gst::PadProbeType::BUFFER, move |_, info| {
            if let Some(pts) = info.buffer().and_then(|buffer| buffer.pts())
                && let Some(transform) = weak.upgrade()
            {
                let camera = sample(&keys, pts.mseconds());
                transform.set_properties(&[
                    ("scale-x", &(camera.scale as f32)),
                    ("scale-y", &(camera.scale as f32)),
                    ("translation-x", &(((0.5 - camera.x) * camera.scale) as f32)),
                    ("translation-y", &(((camera.y - 0.5) * camera.scale) as f32)),
                ]);
            }
            gst::PadProbeReturn::Ok
        });
    Ok(effect)
}

/// Sparse keys use the same linear interpolation for forward playback and paused seeking.
pub fn sample(keys: &[CameraKey], time: u64) -> Camera {
    let index = keys.partition_point(|key| key.time_ms <= time);
    let Some(left) = index.checked_sub(1).and_then(|index| keys.get(index)) else {
        return keys.first().map_or(Camera::default(), |key| key.camera);
    };
    let Some(right) = keys.get(index) else {
        return left.camera;
    };
    let t = (time - left.time_ms) as f64 / (right.time_ms - left.time_ms).max(1) as f64;
    let lerp = |a: f64, b: f64| a + (b - a) * t;
    Camera {
        x: lerp(left.camera.x, right.camera.x),
        y: lerp(left.camera.y, right.camera.y),
        scale: lerp(left.camera.scale, right.camera.scale),
    }
}
