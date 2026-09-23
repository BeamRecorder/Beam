#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod error;
mod output;
mod types;
mod worker;

use beam_media_engine::{
    AudioSelection, CameraSelection, ProjectId, RecordingConfig, RecordingController,
    RecordingState,
};

#[test]
fn native_unavailable_camera_returns_real_failed_track() {
    let root = tempfile::tempdir().unwrap();
    let controller = RecordingController::new(root.path()).unwrap();
    let project_id = ProjectId::new();
    let status = controller
        .prepare(RecordingConfig {
            output: Default::default(),
            screen: None,
            project_id,
            camera: CameraSelection::Device(beam_camera::CameraRequest {
                device_id: "beam-engine-nonexistent-camera".into(),
                width: 16,
                height: 16,
                fps: 30,
            }),
            microphone: AudioSelection::Disabled,
            system_audio: AudioSelection::Disabled,
        })
        .unwrap();
    assert_eq!(status.manifest.as_ref().unwrap().project_id, project_id);
    assert_eq!(
        status.manifest.as_ref().unwrap().tracks[0].status,
        beam_media_manifest::TrackStatus::Failed
    );
    assert!(controller.start(status.session_id.unwrap()).is_err());
    assert_eq!(controller.status().state, RecordingState::Failed);
    let disk: beam_media_manifest::SessionManifest =
        serde_json::from_slice(&std::fs::read(status.manifest_path.unwrap()).unwrap()).unwrap();
    assert_eq!(disk.project_id, project_id);
    assert!(!disk.completed);
}
#[path = "bin/beam-media-engine.rs"]
mod command_process;
mod process;
mod protocol;
