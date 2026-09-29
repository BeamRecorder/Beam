use beam_editor_engine::{Edit, EditorController, Effects};

#[test]
fn gpu_color_effect_preserves_clip_placement_and_opacity_metadata() {
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Color".into())
        .unwrap();
    let snapshot = controller
        .import(vec![crate::fixtures::media(
            media.path(),
            "color.webm",
            false,
        )])
        .unwrap();
    let id = snapshot.project.clips[0].id;
    let effects = Effects {
        scale: 0.5,
        x: 0.75,
        brightness: 0.5,
        opacity: 0.5,
        ..Effects::default()
    };
    let edited = controller
        .edit(
            snapshot.revision,
            Edit::Effects {
                id,
                effects: effects.clone(),
            },
        )
        .unwrap();
    controller.seek(100).unwrap();
    let frame = controller.frame().unwrap();
    assert!(
        frame.rgba[..3]
            .iter()
            .all(|channel| channel.abs_diff(22) <= 3)
    );
    let inside = &frame.rgba[(50 * 320 + 170) * 4..(50 * 320 + 170) * 4 + 3];
    assert!(
        inside.iter().all(|value| *value > 30 && *value < 200),
        "GPU color and opacity: {inside:?}"
    );
    controller
        .edit(
            edited.revision,
            Edit::Effects {
                id,
                effects: Effects {
                    opacity: 0.,
                    ..effects
                },
            },
        )
        .unwrap();
    controller.seek(100).unwrap();
    assert!(
        controller
            .frame()
            .unwrap()
            .rgba
            .as_chunks::<4>()
            .0
            .iter()
            .all(|pixel| pixel[..3].iter().all(|channel| channel.abs_diff(22) <= 3))
    );
}
