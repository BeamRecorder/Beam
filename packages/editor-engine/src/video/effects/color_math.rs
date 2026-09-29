//! GStreamer's native colour matrix is calculated in f64, then uploaded as f32.
use super::batch_types::ColorUniforms;

pub(crate) fn uniforms(brightness: f64, contrast: f64, hue: f64, saturation: f64) -> ColorUniforms {
    let cosine = saturation * (hue * std::f64::consts::PI).cos();
    let sine = saturation * (hue * std::f64::consts::PI).sin();
    ColorUniforms {
        coefficients: [
            (0.256816 * contrast) as f32,
            (0.504154 * contrast) as f32,
            (0.0979137 * contrast) as f32,
            (-0.148246 * cosine + 0.439271 * sine) as f32,
            (-0.29102 * cosine - 0.367833 * sine) as f32,
            (0.439266 * cosine - 0.071438 * sine) as f32,
            (0.148246 * sine + 0.439271 * cosine) as f32,
            (0.29102 * sine - 0.367833 * cosine) as f32,
            (-0.439266 * sine - 0.071438 * cosine) as f32,
        ],
        constant: (0.0625 * contrast
            + contrast * ((16. * 219. / 256. / 256.) / (219. / 256.))
            + brightness
            - (16. / 256.)) as f32,
        passthrough: brightness == 0. && contrast == 1. && hue == 0. && saturation == 1.,
    }
}
