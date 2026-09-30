use beam_editor_domain::recording::{cursor_style_types::SelectionMode, style_types::CursorStyle};
#[test]
fn fixed_selection_requires_an_id_and_blocks_path_characters() {
    let mut style = CursorStyle::default();
    style.selection.mode = SelectionMode::Fixed;
    assert!(style.validate().is_err());
    style.selection.cursor_id = Some("textcursor".into());
    assert!(style.validate().is_ok());
    for id in ["", "../escape", "bad/id", "script?", "é"] {
        style.selection.cursor_id = Some(id.into());
        assert!(style.validate().is_err());
    }
}
#[test]
fn shadow_motion_and_click_limits_reject_nonfinite_and_invalid_values() {
    let original = CursorStyle::default();
    for number in [f64::NAN, f64::INFINITY, -1., 31.] {
        let mut style = original.clone();
        style.shadow.blur = number;
        assert!(style.validate().is_err());
    }
    for number in [-0.1, 1.1, f64::NAN] {
        let mut style = original.clone();
        style.motion.smoothing = number;
        assert!(style.validate().is_err());
        style = original.clone();
        style.motion.motion_blur = number;
        assert!(style.validate().is_err());
        style = original.clone();
        style.shadow.color[3] = number;
        assert!(style.validate().is_err());
        style = original.clone();
        style.click_effects.right.ripple_color[0] = number;
        assert!(style.validate().is_err());
    }
    for number in [0.49, 2.01, f64::NAN] {
        let mut style = original.clone();
        style.motion.spring_mass_multiplier = number;
        assert!(style.validate().is_err());
    }
    for number in [9., 81., f64::NAN] {
        let mut style = original.clone();
        style.click_effects.left.ripple_size = number;
        assert!(style.validate().is_err());
    }
    for number in [-1., 101., f64::NAN] {
        let mut style = original.clone();
        style.click_effects.right.spring_intensity = number;
        assert!(style.validate().is_err());
    }
    let mut style = original;
    style.fade_duration_ms = 1001;
    assert!(style.validate().is_err());
}
#[test]
fn accepted_boundary_values_and_profile_identifiers_remain_valid() {
    for (blur, smoothing, mass, size, intensity, fade) in
        [(0., 0., 0.5, 10., 0., 0), (30., 1., 2., 80., 100., 1000)]
    {
        let mut style = CursorStyle::default();
        style.shadow.blur = blur;
        style.motion.smoothing = smoothing;
        style.motion.spring_mass_multiplier = mass;
        style.click_effects.left.ripple_size = size;
        style.click_effects.left.spring_intensity = intensity;
        style.fade_duration_ms = fade;
        assert!(style.validate().is_ok());
    }
    for id in ["", "../../bad", "a/b", &"a".repeat(129)] {
        let mut style = CursorStyle::default();
        style.selection.pack_id = id.into();
        assert!(style.validate().is_err());
    }
}
