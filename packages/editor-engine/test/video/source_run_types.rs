#[test]
fn a_native_run_retains_every_logical_clip_identity() {
    let project = crate::fixtures::project();
    let clips = project
        .clips
        .try_iter()
        .collect::<beam_editor_engine::Result<_>>()
        .unwrap();
    let runs = beam_editor_engine::video::source_runs::compile(&project, clips, false).unwrap();
    assert_eq!(runs.len(), 1);
    assert_eq!(
        runs[0].logical_ids,
        vec![crate::video::clip(&project, 0).id]
    );
    assert_eq!(
        runs[0].duration_ms,
        crate::video::clip(&project, 0).duration_ms
    );
}
