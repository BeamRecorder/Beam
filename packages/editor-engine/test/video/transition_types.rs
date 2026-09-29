#[test]
fn render_windows_keep_logical_timing_and_borrow_the_exact_source_handles() {
    use beam_editor_domain::effects::Transition;
    use beam_editor_engine::video::transitions::window;
    let mut project = super::effects::project();
    let mut to = crate::video::clip_mut(&mut project, 0).clone();
    to.id = uuid::Uuid::new_v4();
    to.generator = Some(to.generator.as_ref().unwrap().duplicate());
    to.start_ms = 1000;
    to.source_in_ms = 500;
    let transition = Transition {
        from_clip: crate::video::clip(&project, 0).id,
        to_clip: to.id,
        duration_ms: 401,
        instance: super::effects::definition(&project, "beam.crossfade").instantiate(),
    };
    project.clips.try_push(to).unwrap();
    project.transitions.push(transition);
    let from = window(&project, &crate::video::clip(&project, 0)).unwrap();
    let to = window(&project, &crate::video::clip(&project, 1)).unwrap();
    assert_eq!((from.start_ms, from.duration_ms), (0, 1200));
    assert_eq!(
        (to.start_ms, to.source_in_ms, to.duration_ms),
        (799, 299, 1201)
    );
    assert_eq!(crate::video::clip_mut(&mut project, 0).duration_ms, 1000);
    project.transitions[0].instance.enabled = false;
    assert_eq!(
        window(&project, &crate::video::clip(&project, 1))
            .unwrap()
            .start_ms,
        1000
    );
    project.transitions[0].instance.enabled = true;
    crate::video::clip_mut(&mut project, 1).source_in_ms = 0;
    assert!(window(&project, &crate::video::clip(&project, 1)).is_err());
}
