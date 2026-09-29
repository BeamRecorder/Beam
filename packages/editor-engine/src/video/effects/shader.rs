//! One-input GLSL uses encoded RGBA with straight alpha; the stack follows array order.
use crate::{Result, video::pipeline::media};
use ges::prelude::*;

pub(crate) const HEADER: &str = "#ifdef GL_ES\nprecision mediump float;\n#endif\nvarying vec2 v_texcoord;\nuniform sampler2D tex;\n";
pub(crate) fn opacity() -> String {
    format!(
        "{HEADER}uniform float beam_opacity;\nvoid main() {{ vec4 c = texture2D(tex, v_texcoord); gl_FragColor = vec4(c.rgb, c.a * beam_opacity); }}"
    )
}
pub(crate) fn solid() -> String {
    format!(
        "{HEADER}uniform float beam_r; uniform float beam_g; uniform float beam_b; uniform float beam_a;\nvoid main() {{ gl_FragColor = vec4(beam_r, beam_g, beam_b, beam_a); }}"
    )
}
pub(crate) fn transform() -> String {
    format!(
        "{HEADER}uniform float beam_scale_x; uniform float beam_scale_y; uniform float beam_x; uniform float beam_y; uniform float beam_rotation; uniform float beam_anchor_x; uniform float beam_anchor_y; uniform float beam_aspect;\nvoid main() {{ vec2 anchor = vec2(beam_anchor_x, beam_anchor_y); vec2 p = v_texcoord - anchor - vec2(beam_x, beam_y); p.x *= beam_aspect; float a = radians(beam_rotation); float c = cos(a); float s = sin(a); p = vec2(c*p.x + s*p.y, -s*p.x + c*p.y); p.x /= beam_aspect; vec2 uv = p / vec2(beam_scale_x, beam_scale_y) + anchor; gl_FragColor = (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) ? vec4(0.0) : texture2D(tex, uv); }}"
    )
}
pub(crate) fn extension(fragment: &str) -> Result<String> {
    if fragment.contains("beam_active") || fragment.contains("beam_main") {
        return Err(media("shader uses a reserved Beam uniform or entry point"));
    }
    let entry = fragment
        .find("void main")
        .ok_or_else(|| media("shader requires void main()"))?;
    let mut result = String::with_capacity(fragment.len() + 220);
    result.push_str(&fragment[..entry]);
    result.push_str("uniform float beam_active;\n");
    result.push_str(&fragment[entry..].replacen("void main", "void beam_main", 1));
    result.push_str("\nvoid main() { beam_main(); gl_FragColor = mix(texture2D(tex, v_texcoord), gl_FragColor, beam_active); }\n");
    Ok(result)
}
pub(crate) fn set_fragment(effect: &ges::Effect, fragment: &str) -> Result<gst::Element> {
    let shader = effect
        .element()
        .and_then(|element| element.downcast::<gst::Bin>().ok())
        .and_then(|bin| bin.by_name("beam_processor"))
        .ok_or_else(|| media("missing GL shader node"))?;
    shader.set_property("fragment", fragment);
    Ok(shader)
}
