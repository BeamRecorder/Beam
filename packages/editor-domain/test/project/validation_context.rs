use beam_editor_domain::project::validation;

#[test]
fn successful_metadata_memos_do_not_hide_later_telemetry_mutations() {
    let mut project = crate::fixtures::project();
    project.assets[0].cursor = vec![crate::fixtures::point(1, 0.5, 0.5, None)].into();
    validation::project(&project).unwrap();
    std::sync::Arc::make_mut(&mut project.assets[0].cursor)[0].cx = 2.;
    assert!(validation::project(&project).is_err());
}
