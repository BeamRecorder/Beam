use beam_editor_engine::{Edit, EditorController};
#[test]
fn generated_titles_render_and_fade_at_native_frame_times_without_a_source_file() {
    use beam_editor_engine::timeline::title_types::Title;
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    let snapshot = controller
        .create(root.path().into(), "Title".into())
        .unwrap();
    let mut canvas = snapshot.project.canvas.clone();
    canvas.width = 320;
    canvas.height = 180;
    let snapshot = controller
        .edit(snapshot.revision, Edit::Canvas { canvas })
        .unwrap();
    let snapshot = controller
        .edit(
            snapshot.revision,
            Edit::InsertTitle {
                title: Title {
                    text: "BEAM & <native>".into(),
                    size: 15.,
                    ..Title::default()
                },
                start_ms: 0,
            },
        )
        .unwrap();
    assert!(
        snapshot.transport.error.is_none(),
        "{:?}",
        snapshot.transport.error
    );
    controller.seek(500).unwrap();
    let visible = controller.frame().unwrap().rgba;
    assert!(
        visible
            .as_chunks::<4>()
            .0
            .iter()
            .any(|pixel| pixel[0] > 150 && pixel[1] > 150 && pixel[2] > 150),
        "native title must paint text"
    );
    let mut effects = crate::video::clip(&controller.document().unwrap().project, 0)
        .effects
        .clone();
    effects.fade_in_ms = 1000;
    controller
        .edit(
            snapshot.revision,
            Edit::Effects {
                id: snapshot.project.clips[0].id,
                effects,
            },
        )
        .unwrap();
    controller.seek(0).unwrap();
    let faded = controller.frame().unwrap().rgba;
    assert!(
        faded.as_chunks::<4>().0.iter().all(|pixel| pixel[0] < 50),
        "title fade must hide text at start"
    );
}
