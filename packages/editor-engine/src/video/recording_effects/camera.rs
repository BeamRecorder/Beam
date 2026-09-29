//! Fixed-size GPU camera transforms consume curves prepared before a commit.
use super::super::effects::{state::sequence_time, types::RenderState};
use crate::{
    Result,
    video::{gpu::camera::sample, pipeline::media},
};
use beam_editor_domain::recording::types::Camera;
use ges::prelude::*;
use uuid::Uuid;

pub(crate) fn effect(shared: RenderState, clip_id: Uuid, instance_id: Uuid) -> Result<ges::Effect> {
    let effect = ges::Effect::new("video glupload name=beam_gpu_input ! glcolorconvert ! glshader name=beam_recording ! identity name=beam_gpu_output").map_err(media)?;
    super::super::gpu::meta::preserve(&effect)?;
    let transform = super::target(&effect)?;
    transform.set_property("fragment", fragment());
    let weak = transform.downgrade();
    transform
        .static_pad("sink")
        .ok_or_else(|| media("camera processor has no input"))?
        .add_probe(gst::PadProbeType::BUFFER, move |_, info| {
            let Some(transform) = weak.upgrade() else {
                return gst::PadProbeReturn::Ok;
            };
            let decision = (|| -> Result<Camera> {
                let pts = info
                    .buffer()
                    .and_then(|buffer| buffer.pts())
                    .ok_or_else(|| media("camera buffer has no source timestamp"))?;
                let states = shared.read().unwrap_or_else(|p| p.into_inner());
                let state = states
                    .get(&clip_id)
                    .ok_or_else(|| media("camera clip is missing from the render state"))?;
                let sequence = sequence_time(&state.clip, pts)?;
                let instance = state
                    .clip
                    .instances
                    .iter()
                    .find(|i| i.id == instance_id)
                    .ok_or_else(|| media("camera instance is missing from the render state"))?;
                let asset = state
                    .asset
                    .as_ref()
                    .ok_or_else(|| media("camera source is missing from the render state"))?;
                if !beam_editor_domain::recording::camera::legacy(instance) {
                    return beam_editor_domain::recording::camera::evaluate(
                        instance,
                        asset,
                        &state.clip,
                        sequence,
                    );
                }
                // The legacy curve includes its entry/exit. Generic range gating
                // would truncate V1's envelope at cuts inside the movement.
                let source = beam_editor_domain::timing::map_time(
                    &state.clip,
                    sequence,
                    beam_editor_domain::timing::TimeSpace::Source,
                )?;
                let keys = state
                    .camera_curves
                    .get(&instance_id)
                    .ok_or_else(|| media("camera curve was not prepared before rendering"))?;
                Ok(sample(keys, (source.seconds() * 1000.).max(0.) as u64))
            })();
            match decision {
                Ok(camera) => transform.set_property("uniforms", uniforms(camera)),
                Err(error) => {
                    gst::element_error!(
                        transform,
                        gst::StreamError::Failed,
                        ("camera evaluation failed: {error}")
                    );
                    return gst::PadProbeReturn::Drop;
                }
            }
            gst::PadProbeReturn::Ok
        });
    Ok(effect)
}

pub(crate) fn uniforms(camera: Camera) -> gst::Structure {
    gst::Structure::builder("uniforms")
        .field("beam_camera_x", camera.x as f32)
        .field("beam_camera_y", (1. - camera.y) as f32)
        .field("beam_camera_scale", camera.scale as f32)
        .build()
}

pub fn fragment() -> &'static str {
    "#ifdef GL_ES\nprecision mediump float;\n#endif\n\
    varying vec2 v_texcoord; uniform sampler2D tex;\n\
    uniform float beam_camera_x; uniform float beam_camera_y; uniform float beam_camera_scale;\n\
    void main() { vec2 uv=(v_texcoord-vec2(0.5))/max(beam_camera_scale,1.0)+vec2(beam_camera_x,beam_camera_y);\n\
      gl_FragColor=(uv.x<0.0 || uv.x>1.0 || uv.y<0.0 || uv.y>1.0) ? vec4(0.0) : texture2D(tex,uv); }"
}
