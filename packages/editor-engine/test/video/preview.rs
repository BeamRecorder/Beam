use beam_editor_engine::{Edit, EditorController, Effects};
#[test]
fn aspect_fit_and_background_are_present_in_real_native_rgba_frames() {
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Test".into())
        .unwrap();
    let snapshot = controller
        .import(vec![crate::fixtures::media(
            media.path(),
            "frame.webm",
            false,
        )])
        .unwrap();
    let snapshot = controller
        .edit(
            snapshot.revision,
            Edit::Effects {
                id: snapshot.project.clips[0].id,
                effects: Effects {
                    scale: 0.5,
                    ..Effects::default()
                },
            },
        )
        .unwrap();
    controller.seek(100).unwrap();
    controller.transport().unwrap();
    let frame = controller.frame().unwrap();
    assert_eq!((frame.width, frame.height), (320, 180));
    assert!(
        frame.rgba[..3]
            .iter()
            .all(|channel| channel.abs_diff(22) <= 3),
        "GStreamer preserves the requested canvas background: {:?}",
        &frame.rgba[..4]
    );
    assert!(snapshot.transport.error.is_none());
}
#[test]
fn paused_actor_publishes_a_frame_after_each_seek_without_ui_playback() {
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Test".into())
        .unwrap();
    controller
        .import(vec![crate::fixtures::media(
            media.path(),
            "seek.webm",
            false,
        )])
        .unwrap();
    let mut frames = Vec::new();
    for time in [100, 600, 200] {
        controller.frame();
        controller.seek(time).unwrap();
        controller.transport().unwrap();
        frames.push(controller.frame().unwrap().rgba);
    }
    assert!(
        frames[0] != frames[1],
        "seek must publish distinct source frames"
    );
    assert!(!controller.transport().unwrap().playing);
}
#[test]
fn portrait_canvas_preserves_native_preview_aspect() {
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Test".into())
        .unwrap();
    let snapshot = controller
        .import(vec![crate::fixtures::media(
            media.path(),
            "portrait.webm",
            false,
        )])
        .unwrap();
    let mut canvas = snapshot.project.canvas.clone();
    canvas.width = 1080;
    canvas.height = 1920;
    controller
        .edit(snapshot.revision, Edit::Canvas { canvas })
        .unwrap();
    controller.seek(200).unwrap();
    controller.transport().unwrap();
    let frame = controller.frame().unwrap();
    assert_eq!((frame.width, frame.height), (1080, 1920));
    assert_eq!(frame.rgba.len(), 1080 * 1920 * 4);
}

#[test]
fn recorded_camera_controls_keep_source_time_after_splitting_and_moving_a_clip() {
    use beam_editor_engine::{
        Canvas, Document,
        project::store::ProjectStore,
        video::{probe, zoom::types::Zoom},
    };
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let source = crate::fixtures::media(media.path(), "camera.webm", false);
    let mut asset = probe::import(root.path(), &source).unwrap();
    std::sync::Arc::make_mut(&mut asset.zooms).push(Zoom {
        start_ms: 0,
        end_ms: 1000,
        cx: 0.7,
        cy: 0.4,
        scale: 2.,
    });
    let mut project = crate::fixtures::project();
    project.canvas = Canvas::from_source(asset.width, asset.height);
    crate::video::clip_mut(&mut project, 0).asset_id = asset.id;
    crate::video::clip_mut(&mut project, 0).duration_ms = asset.duration_ms;
    project.assets = vec![asset];
    let id = crate::video::clip_mut(&mut project, 0).id;
    {
        ProjectStore::lock(root.path())
            .unwrap()
            .write(&Document::new(project))
            .unwrap();
    }
    let controller = EditorController::new().unwrap();
    let original = controller.open(root.path().into()).unwrap();
    controller.seek(600).unwrap();
    let before = controller.frame().unwrap();
    assert_eq!(before.position_ms, 600);
    let before = before.rgba;
    let split = controller
        .edit(original.revision, Edit::Split { id, time_ms: 400 })
        .unwrap();
    let right = split
        .project
        .clips
        .iter()
        .find(|clip| clip.id != id)
        .unwrap()
        .clone();
    let removed = controller
        .edit(split.revision, Edit::Remove { id })
        .unwrap();
    controller
        .edit(
            removed.revision,
            Edit::Move {
                id: right.id,
                track_id: right.track_id,
                start_ms: 0,
            },
        )
        .unwrap();
    controller.seek(200).unwrap();
    let after = controller.frame().unwrap();
    assert_eq!(after.position_ms, 200);
    let after = after.rgba;
    let changed = before.iter().zip(&after).filter(|(a, b)| a != b).count();
    let max_diff = before
        .iter()
        .zip(&after)
        .map(|(a, b)| a.abs_diff(*b))
        .max()
        .unwrap();
    let sum_diff: u64 = before
        .iter()
        .zip(&after)
        .map(|(a, b)| a.abs_diff(*b) as u64)
        .sum();
    assert!(
        after == before,
        "camera animation must follow source time through NLE cuts and moves: {changed} changed channels, max {max_diff}, sum {sum_diff}"
    );

    let current = controller.snapshot().unwrap();
    let mut effects = crate::video::clip(&controller.document().unwrap().project, 0)
        .effects
        .clone();
    effects.auto_zoom = false;
    controller
        .edit(
            current.revision,
            Edit::Effects {
                id: right.id,
                effects,
            },
        )
        .unwrap();
    controller.seek(200).unwrap();
    assert!(
        controller.frame().unwrap().rgba != before,
        "the GPU camera must actually transform the image"
    );
}

#[test]
fn native_viewport_consumer_receives_frames_without_json_or_a_pending_raster() {
    use std::sync::{Arc, Mutex};
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    let delivered = Arc::new(Mutex::new(None));
    let output = Arc::clone(&delivered);
    controller.set_frame_consumer(move |frame| *output.lock().unwrap() = Some(frame));
    controller
        .create(root.path().into(), "GPU viewport".into())
        .unwrap();
    controller
        .import(vec![crate::fixtures::media(
            media.path(),
            "viewport.webm",
            false,
        )])
        .unwrap();
    for position in [600, 200, 600, 100, 600, 100] {
        delivered.lock().unwrap().take();
        controller.seek(position).unwrap();
        controller.transport().unwrap();
        let frame = delivered
            .lock()
            .unwrap()
            .take()
            .expect("native canvas frame");
        assert_eq!(
            frame.position_ms, position,
            "the native consumer obeys the requested seek"
        );
        assert_eq!(frame.rgba.len(), (frame.width * frame.height * 4) as usize);
        assert!(controller.frame().is_none());
    }
}

#[test]
fn a_native_seek_completes_after_the_viewport_has_received_its_frame() {
    use std::sync::{Arc, Condvar, Mutex, mpsc};
    use std::time::Duration;
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Seek delivery".into())
        .unwrap();
    controller
        .import(vec![crate::fixtures::media(
            media.path(),
            "delivery.webm",
            false,
        )])
        .unwrap();
    let release = Arc::new((Mutex::new(false), Condvar::new()));
    let delivery = release.clone();
    let (entered, received) = mpsc::channel();
    controller.set_frame_consumer(move |frame| {
        if frame.position_ms != 600 {
            return;
        }
        let _ = entered.send(());
        let (state, wake) = &*delivery;
        let lock = state.lock().unwrap();
        drop(wake.wait_while(lock, |released| !*released).unwrap());
    });
    let premature = std::thread::scope(|scope| {
        let (done, completion) = mpsc::channel();
        let controller = &controller;
        let task = scope.spawn(move || done.send(controller.seek(600)).unwrap());
        let started = received.recv_timeout(Duration::from_secs(10));
        let premature = completion.recv_timeout(Duration::from_millis(100)).ok();
        *release.0.lock().unwrap() = true;
        release.1.notify_all();
        let result = premature
            .as_ref()
            .map(|r| r.as_ref().map(|_| ()).map_err(|e| e.to_string()))
            .unwrap_or_else(|| {
                completion
                    .recv_timeout(Duration::from_secs(10))
                    .unwrap()
                    .map(|_| ())
                    .map_err(|e| e.to_string())
            });
        task.join().unwrap();
        started.expect("native consumer started");
        result.unwrap();
        premature.is_some()
    });
    assert!(
        !premature,
        "a completed seek implies completed viewport delivery"
    );
}
#[test]
fn source_pixels_keep_exact_frame_time_after_splitting_and_moving_without_camera() {
    use beam_editor_engine::{Canvas, Document, project::store::ProjectStore, video::probe};
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let source = crate::fixtures::media(media.path(), "camera.webm", false);
    let asset = probe::import(root.path(), &source).unwrap();
    let mut project = crate::fixtures::project();
    project.canvas = Canvas::from_source(asset.width, asset.height);
    crate::video::clip_mut(&mut project, 0).asset_id = asset.id;
    crate::video::clip_mut(&mut project, 0).duration_ms = asset.duration_ms;
    project.assets = vec![asset];
    let id = crate::video::clip_mut(&mut project, 0).id;
    {
        ProjectStore::lock(root.path())
            .unwrap()
            .write(&Document::new(project))
            .unwrap();
    }
    let controller = EditorController::new().unwrap();
    let original = controller.open(root.path().into()).unwrap();
    controller.seek(600).unwrap();
    let before = controller.frame().unwrap();
    assert_eq!(before.position_ms, 600);
    let before = before.rgba;
    let split = controller
        .edit(original.revision, Edit::Split { id, time_ms: 400 })
        .unwrap();
    let right = split
        .project
        .clips
        .iter()
        .find(|clip| clip.id != id)
        .unwrap()
        .clone();
    let removed = controller
        .edit(split.revision, Edit::Remove { id })
        .unwrap();
    controller
        .edit(
            removed.revision,
            Edit::Move {
                id: right.id,
                track_id: right.track_id,
                start_ms: 0,
            },
        )
        .unwrap();
    controller.seek(200).unwrap();
    let after = controller.frame().unwrap();
    assert_eq!(after.position_ms, 200);
    let after = after.rgba;
    let changed = before.iter().zip(&after).filter(|(a, b)| a != b).count();
    let max_diff = before
        .iter()
        .zip(&after)
        .map(|(a, b)| a.abs_diff(*b))
        .max()
        .unwrap();
    let sum_diff: u64 = before
        .iter()
        .zip(&after)
        .map(|(a, b)| a.abs_diff(*b) as u64)
        .sum();
    assert!(
        after == before,
        "camera animation must follow source time through NLE cuts and moves: {changed} changed channels, max {max_diff}, sum {sum_diff}"
    );
}
