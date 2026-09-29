//! Final color conversion and GPU-memory handoff to hardware video encoders.
use crate::export::types::VideoEncoder;
use gst::prelude::*;

/// Opaque encoders resolve final straight alpha against the authored canvas.
/// Ordinary GES mixes already provide premultiplied RGB; scoped final processors
/// preserve straight RGBA, so their alpha is resolved before conversion to NV12.
pub(crate) fn source_sink(canvas: &crate::Canvas, straight_alpha: bool) -> crate::Result<gst::Bin> {
    let processor = if straight_alpha {
        "glshader name=beam_gpu_input ! glcolorconvert"
    } else {
        "glcolorconvert name=beam_gpu_input"
    };
    let sink = gst::parse::bin_from_description(
        &format!("{processor} ! video/x-raw(memory:GLMemory),format=RGBA,texture-target=2D ! identity name=beam_gpu_output ! appsink name=beam_segment_video sync=false enable-last-sample=false"),
        true,
    ).map_err(crate::video::pipeline::media)?;
    if straight_alpha {
        let shader = sink.by_name("beam_gpu_input").ok_or_else(|| {
            crate::video::pipeline::media("export has no alpha resolution shader")
        })?;
        shader.set_property("fragment", "#ifdef GL_ES\n#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n#endif\nvarying vec2 v_texcoord;uniform sampler2D tex;uniform float beam_background_r;uniform float beam_background_g;uniform float beam_background_b;void main(){vec4 c=texture2D(tex,v_texcoord);vec3 bg=vec3(beam_background_r,beam_background_g,beam_background_b);gl_FragColor=vec4(c.rgb*c.a+bg*(1.0-c.a),1.0);}");
        shader.set_property(
            "uniforms",
            gst::Structure::builder("uniforms")
                .field(
                    "beam_background_r",
                    ((canvas.background >> 16) & 255) as f32 / 255.,
                )
                .field(
                    "beam_background_g",
                    ((canvas.background >> 8) & 255) as f32 / 255.,
                )
                .field("beam_background_b", (canvas.background & 255) as f32 / 255.)
                .build(),
        );
    }
    crate::video::gpu::preserve_bin(&sink)?;
    Ok(sink)
}

pub(crate) fn description(encoder: VideoEncoder) -> &'static str {
    let caps = super::profile::input(encoder);
    if caps
        .features(0)
        .is_some_and(|features| features.contains("memory:GLMemory"))
    {
        "glcolorconvert ! video/x-raw(memory:GLMemory),format=NV12,texture-target=2D,colorimetry=bt709 ! identity"
    } else {
        #[cfg(target_os = "linux")]
        let description = if encoder.factory.starts_with("va") {
            "glcolorconvert ! video/x-raw(memory:GLMemory),format=NV12,texture-target=2D,colorimetry=bt709 ! beamlineardmabuf"
        } else {
            "glcolorconvert ! gldownload ! video/x-raw,format=NV12,colorimetry=bt709"
        };
        #[cfg(not(target_os = "linux"))]
        let description = "glcolorconvert ! gldownload ! video/x-raw,format=NV12,colorimetry=bt709";
        description
    }
}
