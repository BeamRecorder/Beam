#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
#[cfg(test)]
mod checks {
    use crate::backend::backend_checks::fixtures;
    use crate::{
        AudioSelection, CameraSelection, EngineError, ProjectId, RecordingConfig,
        RecordingController, RecordingState, SessionId,
    };
    use std::{
        sync::{Arc, Barrier},
        time::{Duration, Instant},
    };

    fn config(mode: &str) -> RecordingConfig {
        RecordingConfig {
            output: Default::default(),
            screen: None,
            project_id: ProjectId::new(),
            camera: CameraSelection::Disabled,
            microphone: AudioSelection::Device(mode.into()),
            system_audio: AudioSelection::Disabled,
        }
    }
    fn setup() -> (tempfile::TempDir, RecordingController) {
        let root = tempfile::tempdir().unwrap();
        let controller = RecordingController::with_prepare(root.path(), fixtures::prepare).unwrap();
        (root, controller)
    }
    #[test]
    fn complete_cycle_polls_without_host_requests() {
        let (_root, controller) = setup();
        assert_eq!(controller.status().state, RecordingState::Idle);
        let status = controller.prepare(config("ok")).unwrap();
        let id = status.session_id.unwrap();
        assert_eq!(status.state, RecordingState::Armed);
        assert!(controller.camera_preview(id).unwrap().is_none());
        controller.start(id).unwrap();
        let deadline = Instant::now() + Duration::from_secs(2);
        while controller.status().manifest.unwrap().duration_ns == 0 {
            assert!(Instant::now() < deadline);
            std::thread::yield_now();
        }
        let result = controller.stop(id).unwrap();
        assert_eq!(result.state, RecordingState::Completed);
        assert!(result.manifest.unwrap().completed);
        let events = controller.events(0);
        assert!(
            events
                .events
                .iter()
                .any(|event| event.state == RecordingState::Finalizing)
        );
        assert!(controller.events(events.cursor).events.is_empty());
    }
    #[test]
    fn stale_commands_cannot_affect_new_session() {
        let (_root, controller) = setup();
        let first = controller
            .prepare(config("ok"))
            .unwrap()
            .session_id
            .unwrap();
        controller.cancel(first).unwrap();
        let second = controller
            .prepare(config("ok"))
            .unwrap()
            .session_id
            .unwrap();
        assert_ne!(first, second);
        assert!(matches!(
            controller.start(first),
            Err(EngineError::StaleSession)
        ));
        assert!(matches!(
            controller.stop(first),
            Err(EngineError::StaleSession)
        ));
        assert!(matches!(
            controller.camera_preview(first),
            Err(EngineError::StaleSession)
        ));
        assert_eq!(controller.status().state, RecordingState::Armed);
        controller.cancel(second).unwrap();
    }
    #[test]
    fn duplicate_commands_preserve_current_recording() {
        let (_root, controller) = setup();
        let id = controller
            .prepare(config("ok"))
            .unwrap()
            .session_id
            .unwrap();
        assert!(matches!(
            controller.prepare(config("ok")),
            Err(EngineError::InvalidTransition { .. })
        ));
        controller.start(id).unwrap();
        assert!(matches!(
            controller.start(id),
            Err(EngineError::InvalidTransition { .. })
        ));
        assert_eq!(controller.status().state, RecordingState::Recording);
        controller.stop(id).unwrap();
        assert!(matches!(
            controller.stop(id),
            Err(EngineError::InvalidTransition { .. })
        ));
    }
    #[test]
    fn stop_before_start_is_interrupted() {
        let (_root, controller) = setup();
        let id = controller
            .prepare(config("ok"))
            .unwrap()
            .session_id
            .unwrap();
        let stopped = controller.stop(id).unwrap();
        assert_eq!(stopped.state, RecordingState::Interrupted);
        assert!(!stopped.manifest.unwrap().completed);
    }
    #[test]
    fn concurrent_prepare_has_one_owner() {
        let (_root, controller) = setup();
        let barrier = Arc::new(Barrier::new(3));
        let threads: Vec<_> = (0..2)
            .map(|_| {
                let controller = controller.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    controller.prepare(config("ok"))
                })
            })
            .collect();
        barrier.wait();
        let results: Vec<_> = threads
            .into_iter()
            .map(|thread| thread.join().unwrap())
            .collect();
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert_eq!(
            results
                .iter()
                .filter(|result| matches!(result, Err(EngineError::InvalidTransition { .. })))
                .count(),
            1
        );
    }
    #[test]
    fn prepare_failure_is_retained_and_retryable() {
        let (_root, controller) = setup();
        assert!(controller.prepare(config("prepare-error")).is_err());
        assert_eq!(controller.status().state, RecordingState::Failed);
        assert!(controller.status().error.unwrap().contains("prepare-error"));
        assert_eq!(
            controller.prepare(config("ok")).unwrap().state,
            RecordingState::Armed
        );
    }
    #[test]
    fn start_failure_and_no_available_track_finalize() {
        for mode in ["start-error", "no-track"] {
            let (_root, controller) = setup();
            let id = controller
                .prepare(config(mode))
                .unwrap()
                .session_id
                .unwrap();
            assert!(controller.start(id).is_err());
            assert_eq!(controller.status().state, RecordingState::Failed);
            assert!(controller.prepare(config("ok")).is_ok());
        }
    }
    #[test]
    fn poll_failure_is_visible_without_status_command() {
        let (_root, controller) = setup();
        let id = controller
            .prepare(config("poll-error"))
            .unwrap()
            .session_id
            .unwrap();
        controller.start(id).unwrap();
        let deadline = Instant::now() + Duration::from_secs(2);
        while controller.status().state != RecordingState::Failed {
            assert!(Instant::now() < deadline);
            std::thread::yield_now();
        }
        assert!(
            controller
                .events(0)
                .status
                .error
                .unwrap()
                .contains("poll-error")
        );
        assert!(controller.prepare(config("ok")).is_ok());
    }
    #[test]
    fn finish_failure_is_returned_as_failed_status() {
        let (_root, controller) = setup();
        let id = controller
            .prepare(config("finish-error"))
            .unwrap()
            .session_id
            .unwrap();
        controller.start(id).unwrap();
        let result = controller.stop(id).unwrap();
        assert_eq!(result.state, RecordingState::Failed);
        assert!(result.error.unwrap().contains("finish-error"));
    }
    #[test]
    fn only_last_owner_drop_closes_worker() {
        let (_root, controller) = setup();
        let other = controller.clone();
        let id = controller
            .prepare(config("ok"))
            .unwrap()
            .session_id
            .unwrap();
        let events = controller.owner.events.clone();
        drop(controller);
        other.start(id).unwrap();
        drop(other);
        assert_eq!(events.read(0).status.state, RecordingState::Interrupted);
        assert_eq!(events.read(0).status.error.as_deref(), Some("host closed"));
    }
    #[test]
    fn invalid_config_has_no_session_or_disk_side_effects() {
        let (root, controller) = setup();
        assert!(controller.prepare(config("")).is_err());
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 0);
        assert_eq!(controller.status().state, RecordingState::Idle);
        assert!(matches!(
            controller.start(SessionId::new()),
            Err(EngineError::StaleSession)
        ));
    }

    #[test]
    fn full_command_queue_rejects_without_executing() {
        use crate::{controller::Owner, events::EventLog, worker::Command};
        let (commands, incoming) = std::sync::mpsc::sync_channel(1);
        let engine = RecordingController {
            owner: Arc::new(Owner {
                root: std::path::PathBuf::new(),
                commands,
                thread: std::sync::Mutex::new(None),
                events: Arc::new(EventLog::new()),
            }),
        };
        engine.owner.commands.send(Command::Shutdown).unwrap();
        assert!(matches!(
            engine.start(SessionId::new()),
            Err(EngineError::Busy)
        ));
        assert!(matches!(incoming.recv().unwrap(), Command::Shutdown));
    }

    #[test]
    fn disconnected_worker_returns_explicit_error() {
        use crate::{controller::Owner, events::EventLog};
        let (commands, incoming) = std::sync::mpsc::sync_channel(1);
        drop(incoming);
        let engine = RecordingController {
            owner: Arc::new(Owner {
                root: std::path::PathBuf::new(),
                commands,
                thread: std::sync::Mutex::new(None),
                events: Arc::new(EventLog::new()),
            }),
        };
        assert!(matches!(
            engine.start(SessionId::new()),
            Err(EngineError::WorkerUnavailable)
        ));
    }

    #[test]
    fn lost_reply_does_not_block_caller() {
        use crate::{controller::Owner, events::EventLog};
        let (commands, incoming) = std::sync::mpsc::sync_channel(1);
        let thread = std::thread::spawn(move || {
            drop(incoming.recv().unwrap());
        });
        let engine = RecordingController {
            owner: Arc::new(Owner {
                root: std::path::PathBuf::new(),
                commands,
                thread: std::sync::Mutex::new(Some(thread)),
                events: Arc::new(EventLog::new()),
            }),
        };
        assert!(matches!(
            engine.start(SessionId::new()),
            Err(EngineError::WorkerUnavailable)
        ));
    }
    #[test]
    fn last_source_loss_and_worker_panic_remain_visible_without_host_polling() {
        for mode in ["source-lost", "poll-panic"] {
            let (_root, controller) = setup();
            let id = controller
                .prepare(config(mode))
                .unwrap()
                .session_id
                .unwrap();
            controller.start(id).unwrap();
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
            while controller.status().state != RecordingState::Failed
                && std::time::Instant::now() < deadline
            {
                std::thread::sleep(std::time::Duration::from_millis(2));
            }
            let status = controller.status();
            assert_eq!(status.state, RecordingState::Failed);
            assert!(status.error.is_some());
        }
    }
    #[test]
    fn managed_output_modes_create_and_reuse_only_their_owned_directories() {
        for (mode, name) in [
            (crate::OutputLocation::Studio, "studio"),
            (crate::OutputLocation::Instant, "instant"),
        ] {
            let (root, controller) = setup();
            let project_id = ProjectId::new();
            for _ in 0..2 {
                let mut request = config("ok");
                request.output = mode;
                request.project_id = project_id;
                let prepared = controller.prepare(request).unwrap();
                assert!(
                    prepared.manifest_path.as_ref().unwrap().starts_with(
                        root.path()
                            .canonicalize()
                            .unwrap()
                            .join(name)
                            .join(project_id.to_string())
                    )
                );
                let id = prepared.session_id.unwrap();
                controller.start(id).unwrap();
                assert_eq!(
                    controller.stop(id).unwrap().state,
                    RecordingState::Completed
                );
            }
        }
    }
}
