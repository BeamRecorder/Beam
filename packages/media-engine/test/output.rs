use beam_media_engine::{
    AudioSelection, CameraSelection, ProjectId, RecordingConfig, RecordingController,
};
fn config() -> RecordingConfig {
    RecordingConfig {
        output: Default::default(),
        screen: None,
        project_id: ProjectId::new(),
        camera: CameraSelection::Disabled,
        microphone: AudioSelection::Disabled,
        system_audio: AudioSelection::Disabled,
    }
}
#[test]
fn rejects_empty_sources_and_identifiers_before_creating_project() {
    let root = tempfile::tempdir().unwrap();
    let controller = RecordingController::new(root.path()).unwrap();
    assert!(controller.prepare(config()).is_err());
    for id in ["", " ", "a\0b", &"x".repeat(1025)] {
        let mut request = config();
        request.microphone = AudioSelection::Device(id.into());
        assert!(controller.prepare(request).is_err());
    }
    assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 0);
}
#[test]
fn rejects_bad_camera_geometry_and_identifier() {
    let root = tempfile::tempdir().unwrap();
    let controller = RecordingController::new(root.path()).unwrap();
    for (width, height, fps) in [
        (0, 1, 1),
        (1, 0, 1),
        (1, 1, 0),
        (16385, 1, 1),
        (1, 16385, 1),
        (1, 1, 241),
    ] {
        let mut request = config();
        request.camera = CameraSelection::FirstAvailable { width, height, fps };
        assert!(controller.prepare(request).is_err());
    }
    let mut request = config();
    request.camera = CameraSelection::Device(beam_camera::CameraRequest {
        device_id: "".into(),
        width: 16,
        height: 16,
        fps: 30,
    });
    assert!(controller.prepare(request).is_err());
}
#[test]
fn rejects_empty_or_file_root() {
    assert!(RecordingController::new("").is_err());
    let file = tempfile::NamedTempFile::new().unwrap();
    assert!(RecordingController::new(file.path()).is_err());
}
#[test]
#[cfg(unix)]
fn project_symlink_cannot_escape_root() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let controller = RecordingController::new(root.path()).unwrap();
    let mut request = config();
    request.microphone = AudioSelection::Default;
    std::os::unix::fs::symlink(
        outside.path(),
        root.path().join(request.project_id.to_string()),
    )
    .unwrap();
    assert!(controller.prepare(request).is_err());
    assert_eq!(std::fs::read_dir(outside.path()).unwrap().count(), 0);
}
#[test]
fn output_modes_reject_files_before_opening_devices() {
    for (mode, name) in [
        (beam_media_engine::OutputLocation::Studio, "studio"),
        (beam_media_engine::OutputLocation::Instant, "instant"),
    ] {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join(name), b"existing file").unwrap();
        let engine = RecordingController::new(root.path()).unwrap();
        let mut request = config();
        request.output = mode;
        request.microphone = AudioSelection::Default;
        assert!(matches!(
            engine.prepare(request),
            Err(beam_media_engine::EngineError::InvalidConfiguration(_))
        ));
        assert_eq!(
            std::fs::read(root.path().join(name)).unwrap(),
            b"existing file"
        );
    }
}
#[cfg(unix)]
#[test]
fn output_modes_never_follow_symlinks_outside_the_managed_root() {
    for (mode, name) in [
        (beam_media_engine::OutputLocation::Studio, "studio"),
        (beam_media_engine::OutputLocation::Instant, "instant"),
    ] {
        let root = tempfile::tempdir().unwrap();
        let external = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(external.path(), root.path().join(name)).unwrap();
        let engine = RecordingController::new(root.path()).unwrap();
        let mut request = config();
        request.output = mode;
        request.microphone = AudioSelection::Default;
        assert!(matches!(
            engine.prepare(request),
            Err(beam_media_engine::EngineError::InvalidConfiguration(_))
        ));
        assert_eq!(std::fs::read_dir(external.path()).unwrap().count(), 0);
    }
}
