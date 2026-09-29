//! Complementary masks combine both real inputs in the native additive compositor.
pub(crate) fn fragment(mask: &str, incoming: bool) -> String {
    let alpha = if incoming { "mask" } else { "1.0-mask" };
    format!(
        "#ifdef GL_ES\nprecision mediump float;\n#endif\nvarying vec2 v_texcoord; uniform sampler2D tex; uniform float beam_progress;\n{mask}\nvoid main() {{ vec4 c=texture2D(tex,v_texcoord); float mask=clamp(beam_transition(vec2(v_texcoord.x,1.0-v_texcoord.y),beam_progress),0.0,1.0); gl_FragColor=vec4(c.rgb,c.a*({alpha})); }}"
    )
}
