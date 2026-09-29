use super::{definition, project, types::Render};
use beam_editor_domain::animation::{Binding, Value};

#[test]
fn the_fused_color_matrix_matches_native_double_precision_coefficients() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        for (hue, saturation, contrast) in [(0.37, 0.87, 1.11), (-0.93, 1.94, 0.81), (0., 0., 1.)] {
            let mut separate = project();
            let mut color = definition(&separate, "beam.color").instantiate();
            for (key, value) in [
                ("hue", hue),
                ("saturation", saturation),
                ("contrast", contrast),
            ] {
                color
                    .parameters
                    .insert(key.into(), Binding::constant(Value::Number(value)));
            }
            crate::video::clip_mut(&mut separate, 0)
                .instances
                .push(color.clone());
            let mut fused = separate.clone();
            let neutral = definition(&fused, "beam.color").instantiate();
            crate::video::clip_mut(&mut fused, 0)
                .instances
                .push(neutral);
            let actual = Render::new(root.path(), &fused).center(400);
            let reference = Render::new(root.path(), &separate).center(400);
            assert_eq!(
                actual, reference,
                "matrix coefficients and GLSL operation order: h={hue} s={saturation} k={contrast}"
            );
        }
    });
}
