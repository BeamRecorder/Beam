use beam_media_engine::{
    RecordingController,
    process::handle,
    protocol::{Command, Request},
};
#[test]
fn process_adapter_checks_version_before_dispatch_and_returns_typed_status() {
    let root = tempfile::tempdir().unwrap();
    let controller = RecordingController::new(root.path()).unwrap();
    let bad = handle(
        &controller,
        Request {
            version: 999,
            id: "bad".into(),
            command: Command::Status {},
        },
    );
    assert!(!bad.ok);
    assert!(bad.error.unwrap().message.contains("version"));
    let status = handle(
        &controller,
        Request {
            version: 1,
            id: "status".into(),
            command: Command::Status {},
        },
    );
    assert!(status.ok);
    assert_eq!(status.result.unwrap()["state"], "idle");
}

#[test]
#[cfg(target_os = "linux")]
fn linux_native_discovery_reports_each_category_independently_without_opening_streams() {
    let root = tempfile::tempdir().unwrap();
    let controller = RecordingController::new(root.path()).unwrap();
    let reply = handle(
        &controller,
        Request {
            version: 1,
            id: "devices".into(),
            command: Command::Sources {},
        },
    );
    assert!(reply.ok);
    let result = reply.result.unwrap();
    for category in ["screens", "cameras", "microphones", "systemOutputs"] {
        assert!(result[category].get("Ok").is_some() || result[category].get("Err").is_some());
    }
    let capabilities = handle(
        &controller,
        Request {
            version: 1,
            id: "capabilities".into(),
            command: Command::Capabilities {},
        },
    );
    assert!(capabilities.ok || capabilities.error.is_some());
    assert_eq!(
        controller.status().state,
        beam_media_engine::RecordingState::Idle
    );
    assert!(std::fs::read_dir(root.path()).unwrap().next().is_none());
}

#[test]
#[cfg(target_os = "linux")]
fn invalid_linux_still_source_cleans_reserved_session_and_does_not_start_recording() {
    let root = tempfile::tempdir().unwrap();
    let controller = RecordingController::new(root.path()).unwrap();
    let id = beam_media_engine::ProjectId::new();
    let response = handle(
        &controller,
        Request {
            version: 1,
            id: "still".into(),
            command: Command::Screenshot {
                config: beam_media_engine::StillConfig {
                    project_id: id,
                    screen: beam_media_engine::ScreenSelection::Source {
                        source_id: beam_screen::model::SourceId::new("not-a-linux-portal").unwrap(),
                    },
                    region: None,
                    excluded_window_handles: vec![],
                },
            },
        },
    );
    assert!(!response.ok);
    let sessions = root.path().join(id.to_string());
    assert_eq!(std::fs::read_dir(sessions).unwrap().count(), 0);
    assert_eq!(
        controller.status().state,
        beam_media_engine::RecordingState::Idle
    );
}
