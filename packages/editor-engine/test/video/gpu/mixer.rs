use beam_editor_engine::{Edit, EditorController};

#[test]
fn gpu_mixer_lane_visibility_preserves_the_full_canvas_background() {
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Layers".into())
        .unwrap();
    let snapshot = controller
        .import(vec![crate::fixtures::media(
            media.path(),
            "visible.webm",
            false,
        )])
        .unwrap();
    let id = snapshot.project.clips[0].track_id;
    let edited = controller
        .edit(
            snapshot.revision,
            Edit::Track {
                id,
                muted: false,
                hidden: true,
            },
        )
        .unwrap();
    controller.seek(100).unwrap();
    let hidden = controller.frame().unwrap().rgba;
    assert!(
        hidden
            .as_chunks::<4>()
            .0
            .iter()
            .all(|pixel| pixel[..3].iter().all(|channel| channel.abs_diff(22) <= 3))
    );
    controller
        .edit(
            edited.revision,
            Edit::Track {
                id,
                muted: false,
                hidden: false,
            },
        )
        .unwrap();
    controller.seek(100).unwrap();
    assert!(controller.frame().unwrap().rgba != hidden);
}
