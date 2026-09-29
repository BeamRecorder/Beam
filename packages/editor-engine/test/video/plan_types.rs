use beam_editor_engine::video::{plan_types::RELOAD_MARGIN_MS, plan_types::RenderPlan};
#[test]
fn preload_margins_preserve_document_edges_and_reject_outside_ranges() {
    let mut project = super::effects::project();
    crate::video::clip_mut(&mut project, 0).duration_ms = 60_000;
    let beginning = RenderPlan::preview(&project, 0).unwrap();
    assert!(beginning.contains_position(0));
    assert!(!beginning.contains_position(beginning.end_ms - RELOAD_MARGIN_MS));
    let end = RenderPlan::preview(&project, 60_000).unwrap();
    assert!(end.contains_position(60_000));
    assert!(!end.contains_position(61_000));
    assert!(RenderPlan::preview(&project, 60_001).is_err());
    assert!(RenderPlan::range(&project, 400, 300).is_err());
    assert!(RenderPlan::range(&project, 0, 60_001).is_err());
}

#[test]
fn planning_never_turns_unavailable_effect_payloads_into_empty_clips() {
    use beam_editor_domain::collections::{LazyPage, PersistentCollection};
    let mut project = super::effects::project();
    let headers = project
        .clips
        .page_headers(0)
        .unwrap()
        .into_iter()
        .map(|header| header.as_ref().clone())
        .collect();
    project.clips = PersistentCollection::from_lazy(
        vec![LazyPage {
            hash: "a".repeat(64),
            headers,
        }],
        std::sync::Arc::new(|_| {
            Err(beam_editor_engine::EditorError::Invalid(
                "missing effect payload".into(),
            ))
        }),
    )
    .unwrap();
    let plan = RenderPlan::range(&project, 100, 200).unwrap();
    assert_eq!(plan.clips.len(), 1);
    assert_eq!(project.clips.loaded_pages(), 0);
    let root = tempfile::tempdir().unwrap();
    let error = beam_editor_engine::video::pipeline::build_window(root.path(), &project, 100, 200)
        .unwrap_err();
    assert!(
        error.to_string().contains("missing effect payload"),
        "{error}"
    );
    assert_eq!(project.clips.loaded_pages(), 0);
}
