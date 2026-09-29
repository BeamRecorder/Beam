//! Encoded RGBA and BT.601 narrow-range math match native glcolorbalance.
//! Reference equations: GStreamer/ext/gl/gstglcolorbalance.c. Quantization after
//! every operation preserves intermediate RGBA8 surfaces without allocating them.
use super::batch_types::{BatchKind, BatchOperation};

pub(crate) fn fragment(operations: &[BatchOperation]) -> String {
    // Native glcolorbalance selects the context's highest fragment precision.
    // ES mediump can round a grey channel across an RGBA8 boundary before the
    // intermediate quantization; use the same highp capability contract.
    const HEADER: &str = "#ifdef GL_ES\n#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n#endif\nvarying vec2 v_texcoord;\nuniform sampler2D tex;\n";
    let mut source = format!(
        "{HEADER}\nvec4 quantize(vec4 c) {{ return floor(clamp(c,0.0,1.0)*255.0+0.5)/255.0; }}\n#define from_yuv_bt601_offset vec4(-0.0625,-0.5,-0.5,0.0)\n#define from_yuv_coeff_mat mat4(1.164,0.000,1.596,0.0,1.164,-0.391,-0.813,0.0,1.164,2.018,0.000,0.0,0.0,0.0,0.0,1.0)\nvec4 balance(vec4 c,mat4 matrix,float constant) {{vec4 yuva=c*matrix+vec4(constant,0.5,0.5,0.0);yuva=clamp(yuva,0.0,1.0);return quantize(yuva*from_yuv_coeff_mat+from_yuv_bt601_offset*from_yuv_coeff_mat);}}\n"
    );
    let mut body = "void main() {vec4 c=texture2D(tex,v_texcoord);\n".to_owned();
    for (index, operation) in operations.iter().enumerate() {
        match operation.kind {
            BatchKind::Color => {
                for component in 0..9 {
                    source.push_str(&format!("uniform float m{index}_{component};\n"));
                }
                source.push_str(&format!("uniform float d{index};uniform float p{index};\n"));
                body.push_str(&format!("if(p{index}<0.5)c=balance(c,mat4(m{index}_0,m{index}_1,m{index}_2,0.0,m{index}_3,m{index}_4,m{index}_5,0.0,m{index}_6,m{index}_7,m{index}_8,0.0,0.0,0.0,0.0,1.0),d{index});\n"));
            }
            BatchKind::Opacity => {
                source.push_str(&format!("uniform float a{index};\n"));
                body.push_str(&format!("c=quantize(vec4(c.rgb,c.a*a{index}));\n"));
            }
        }
    }
    source.push_str(&body);
    source.push_str("gl_FragColor=c;}\n");
    source
}
