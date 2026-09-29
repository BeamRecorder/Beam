use beam_editor_engine::{
    EditorController,
    export::{
        render::Exporter,
        types::{Container, ExportPhase},
    },
};
#[test]
fn empty_project_cannot_start_a_render() {
    let job = Exporter::default();
    assert!(
        job.start(
            "/tmp".into(),
            beam_editor_engine::Project::new("Empty".into()),
            "/tmp/empty.mp4".into(),
            Container::Mp4
        )
        .is_err()
    );
    assert_eq!(job.status().phase, ExportPhase::Idle);
}
#[test]
#[ignore = "requires a hardware video encoder and OpenGL; uses no GUI"]
fn mp4_export_encodes_actual_video_and_audio_through_ges() {
    use beam_editor_engine::{Canvas, Document, project::store::ProjectStore, video::probe};
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let source = crate::fixtures::media(media.path(), "audio.webm", true);
    let asset = probe::import(root.path(), &source).unwrap();
    let mut project = crate::fixtures::project();
    project.canvas = Canvas::from_source(asset.width, asset.height);
    project.clips[0].asset_id = asset.id;
    project.clips[0].duration_ms = asset.duration_ms;
    project.assets = vec![asset];
    {
        ProjectStore::lock(root.path())
            .unwrap()
            .write(&Document::new(project))
            .unwrap();
    }
    let controller = EditorController::new().unwrap();
    // Audio export remains testable when a CI machine has no playback device.
    controller.open(root.path().into()).unwrap();
    let output = media.path().join("movie.mp4");
    controller.export(output.clone(), Container::Mp4).unwrap();
    let status = crate::fixtures::wait_export(&controller);
    assert_eq!(status.phase, ExportPhase::Completed, "{:?}", status.error);
    let probe = beam_editor_engine::video::probe::discover(&output).unwrap();
    assert!(probe.has_video && probe.has_audio);
}
#[test]
fn existing_destination_is_preserved_and_render_failure_is_reported() {
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Export".into())
        .unwrap();
    controller
        .import(vec![crate::fixtures::media(
            media.path(),
            "source.webm",
            false,
        )])
        .unwrap();
    let output = media.path().join("existing.webm");
    std::fs::write(&output, b"keep this").unwrap();
    controller.export(output.clone(), Container::Webm).unwrap();
    assert_eq!(
        crate::fixtures::wait_export(&controller).phase,
        ExportPhase::Failed
    );
    assert_eq!(std::fs::read(output).unwrap(), b"keep this");
}
#[test]
#[ignore = "requires a hardware video encoder and OpenGL; uses no GUI"]
fn cancellation_and_duplicate_jobs_do_not_publish_partial_output() {
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Export".into())
        .unwrap();
    controller
        .import(vec![crate::fixtures::media(
            media.path(),
            "source.webm",
            false,
        )])
        .unwrap();
    let output = media.path().join("cancel.webm");
    controller.export(output.clone(), Container::Webm).unwrap();
    assert!(
        controller
            .export(media.path().join("second.webm"), Container::Webm)
            .is_err()
    );
    controller.cancel_export();
    assert_eq!(
        crate::fixtures::wait_export(&controller).phase,
        ExportPhase::Cancelled
    );
    assert!(!output.exists());
    assert!(!std::fs::read_dir(media.path()).unwrap().any(|e| {
        e.unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".beam-export-")
    }));
}
