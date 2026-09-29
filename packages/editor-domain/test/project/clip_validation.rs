use beam_editor_domain::{
    project::validation,
    recording::style_types::{CursorMode, CursorStyleOverride},
};

#[test]
fn cursor_overrides_require_a_redrawable_recorded_cursor() {
    let mut project = crate::fixtures::project();
    crate::fixtures::clip_mut(&mut project, 0).cursor_style = Some(CursorStyleOverride::default());
    for mode in [
        CursorMode::Absent,
        CursorMode::BakedIn,
        CursorMode::Unknown,
        CursorMode::Separated,
    ] {
        project.assets[0].cursor_mode = mode;
        assert!(validation::clip(&project, &crate::fixtures::clip(&project, 0)).is_err());
    }
    project.assets[0].cursor = vec![crate::fixtures::point(0, 0.5, 0.5, None)].into();
    assert!(validation::clip(&project, &crate::fixtures::clip(&project, 0)).is_ok());
}

#[test]
fn loaded_payloads_check_parameters_and_native_layout_compatibility() {
    let mut project = crate::fixtures::project();
    let text =
        beam_editor_domain::effects::definition(&project.definitions, "beam.textPlacement", 1)
            .unwrap()
            .instantiate();
    crate::fixtures::clip_mut(&mut project, 0)
        .instances
        .push(text);
    assert!(validation::clip(&project, &crate::fixtures::clip(&project, 0)).is_err());
    crate::fixtures::clip_mut(&mut project, 0).instances.clear();
    crate::fixtures::clip_mut(&mut project, 0).effects.volume = f64::NAN;
    assert!(validation::clip(&project, &crate::fixtures::clip(&project, 0)).is_err());
}
