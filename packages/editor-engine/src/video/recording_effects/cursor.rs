//! The GPU cursor overlay consumes captured positions, never synthetic motion.
use super::super::effects::{state::sequence_time, types::RenderState};
use crate::{MediaAsset, Result, video::pipeline::media};
use beam_editor_domain::{
    effects::Instance,
    recording::{
        cursor,
        style_types::{CursorMode, CursorShape},
    },
    timing::Time,
};
use ges::prelude::*;
use uuid::Uuid;

pub(crate) fn effect(
    asset: &MediaAsset,
    shared: RenderState,
    clip_id: Uuid,
    instance_id: Option<Uuid>,
) -> Result<ges::Effect> {
    validate(asset)?;
    let effect = ges::Effect::new("video glupload name=beam_gpu_input ! glcolorconvert ! glshader name=beam_recording ! identity name=beam_gpu_output").map_err(media)?;
    super::super::gpu::meta::preserve(&effect)?;
    let shader = super::target(&effect)?;
    shader.set_property("fragment", fragment());
    let weak = shader.downgrade();
    shader
        .static_pad("sink")
        .ok_or_else(|| media("cursor processor has no input"))?
        .add_probe(gst::PadProbeType::BUFFER, move |_, info| {
            let Some(shader) = weak.upgrade() else {
                return gst::PadProbeReturn::Ok;
            };
            let decision = (|| -> Result<gst::Structure> {
                let pts = info
                    .buffer()
                    .and_then(|buffer| buffer.pts())
                    .ok_or_else(|| media("cursor buffer has no source timestamp"))?;
                let states = shared.read().unwrap_or_else(|p| p.into_inner());
                let state = states
                    .get(&clip_id)
                    .ok_or_else(|| media("cursor clip is missing from the render state"))?;
                let asset = state
                    .asset
                    .as_ref()
                    .ok_or_else(|| media("cursor source is missing from the render state"))?;
                validate(asset)?;
                let style = state
                    .recording_style
                    .cursor
                    .overridden(state.clip.cursor_style.as_ref());
                let time = sequence_time(&state.clip, pts)?;
                let instance =
                    instance_id.and_then(|id| state.clip.instances.iter().find(|i| i.id == id));
                let active = match (instance_id, instance) {
                    (None, _) => true,
                    (Some(_), Some(instance)) => instance.active(&state.clip, time)?,
                    (Some(_), None) => {
                        return Err(media("cursor instance is missing from the render state"));
                    }
                };
                let position = if active {
                    let index = state
                        .cursor_index
                        .as_ref()
                        .ok_or_else(|| media("cursor index was not prepared before rendering"))?;
                    cursor::at_prepared(asset, &state.clip, index, &style, time)?
                } else {
                    None
                };
                let number = |key, default| parameter(instance, &state.clip, key, time, default);
                let sample =
                    position.unwrap_or(beam_editor_domain::recording::style_types::CursorSample {
                        x: 0.,
                        y: 0.,
                        opacity: 0.,
                        click: None,
                    });
                Ok(gst::Structure::builder("uniforms")
                    .field("beam_x", sample.x as f32)
                    .field("beam_y", (1. - sample.y) as f32)
                    .field("beam_width", asset.width as f32)
                    .field("beam_height", asset.height as f32)
                    .field("beam_size", (style.size * number("sizeScale", 1.)?) as f32)
                    .field(
                        "beam_opacity",
                        (sample.opacity * number("opacity", 1.)?) as f32,
                    )
                    .field(
                        "beam_shape",
                        if style.shape == CursorShape::Pointer {
                            0_f32
                        } else {
                            1_f32
                        },
                    )
                    .field("beam_r", style.color[0] as f32)
                    .field("beam_g", style.color[1] as f32)
                    .field("beam_b", style.color[2] as f32)
                    .field("beam_a", style.color[3] as f32)
                    .field("beam_border_r", style.border_color[0] as f32)
                    .field("beam_border_g", style.border_color[1] as f32)
                    .field("beam_border_b", style.border_color[2] as f32)
                    .field("beam_border_a", style.border_color[3] as f32)
                    .field("beam_click", sample.click.unwrap_or(-1.) as f32)
                    .field("beam_click_opacity", number("clickOpacity", 1.)? as f32)
                    .build())
            })();
            match decision {
                Ok(uniforms) => shader.set_property("uniforms", uniforms),
                Err(error) => {
                    gst::element_error!(
                        shader,
                        gst::StreamError::Failed,
                        ("cursor evaluation failed: {error}")
                    );
                    return gst::PadProbeReturn::Drop;
                }
            }
            gst::PadProbeReturn::Ok
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

pub fn fragment() -> &'static str {
    "#ifdef GL_ES\nprecision mediump float;\n#endif\n\
    varying vec2 v_texcoord; uniform sampler2D tex;\n\
    uniform float beam_x; uniform float beam_y; uniform float beam_width; uniform float beam_height;\n\
    uniform float beam_size; uniform float beam_opacity; uniform float beam_shape;\n\
    uniform float beam_r; uniform float beam_g; uniform float beam_b; uniform float beam_a;\n\
    uniform float beam_border_r; uniform float beam_border_g; uniform float beam_border_b; uniform float beam_border_a;\n\
    uniform float beam_click; uniform float beam_click_opacity;\n\
    float segment(vec2 p, vec2 a, vec2 b) { vec2 v=b-a; return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0)); }\n\
    float triangle(vec2 p, vec2 a, vec2 b, vec2 c) {\n\
      vec2 ab=b-a; vec2 bc=c-b; vec2 ca=a-c;\n\
      float d=min(segment(p,a,b),min(segment(p,b,c),segment(p,c,a)));\n\
      vec2 pa=p-a; vec2 pb=p-b; vec2 pc=p-c;\n\
      float s1=ab.x*pa.y-ab.y*pa.x; float s2=bc.x*pb.y-bc.y*pb.x; float s3=ca.x*pc.y-ca.y*pc.x;\n\
      return ((s1>=0.0 && s2>=0.0 && s3>=0.0) || (s1<=0.0 && s2<=0.0 && s3<=0.0)) ? -d : d;\n\
    }\n\
    vec4 over(vec4 bg,vec4 fg) { float a=fg.a+bg.a*(1.0-fg.a); return vec4((fg.rgb*fg.a+bg.rgb*bg.a*(1.0-fg.a))/max(a,0.00001),a); }\n\
    void main() {\n\
      vec4 source=texture2D(tex,v_texcoord); vec2 pixels=vec2((v_texcoord.x-beam_x)*beam_width,(beam_y-v_texcoord.y)*beam_height);\n\
      vec2 p=pixels/max(beam_size,1.0); float distance;\n\
      if (beam_shape>0.5) distance=length(p)-0.35;\n\
      else distance=min(triangle(p,vec2(0.0),vec2(0.0,0.9),vec2(0.66,0.66)),triangle(p,vec2(0.19,0.51),vec2(0.48,1.12),vec2(0.61,1.05)));\n\
      float edge=1.2/max(beam_size,1.0); float fill=1.0-smoothstep(-edge,edge,distance);\n\
      float outline=1.0-smoothstep(edge,edge*3.0,distance);\n\
      vec4 border=vec4(beam_border_r,beam_border_g,beam_border_b,beam_border_a*outline*beam_opacity);\n\
      vec4 color=vec4(beam_r,beam_g,beam_b,beam_a*fill*beam_opacity);\n\
      vec4 result=over(over(source,border),color);\n\
      if (beam_click>=0.0) { float radius=beam_size*(0.5+beam_click); float ring=1.0-smoothstep(1.0,3.0,abs(length(pixels)-radius));\n\
        result=over(result,vec4(beam_r,beam_g,beam_b,ring*(1.0-beam_click)*beam_click_opacity*beam_opacity*0.65)); }\n\
      gl_FragColor=result;\n\
    }"
}
