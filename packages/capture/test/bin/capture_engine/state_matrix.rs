#![allow(clippy::expect_used)]

use capture::{
    catalog::CatalogSnapshot,
    model::{
        CaptureCapabilities, CaptureRequest, CursorSelection, FailurePolicy, PermissionSnapshot,
        ProjectId, RecordingSettings,
    },
    protocol::Command,
    session::RecordingSession,
};

use super::{Engine, dispatch};

fn prepared_engine(output: &std::path::Path) -> Engine {
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: None,
        system_audio: None,
        cursor: CursorSelection::Disabled,
        recording: RecordingSettings {
            output_root: output.into(),
            minimum_free_bytes: 0,
            ..RecordingSettings::default()
        },
        failure_policy: FailurePolicy::FailFast,
        region: None,
        excluded_process_id: None,
        excluded_window_handles: vec![],
    };
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-09-22T00:00:00Z".into(),
        capabilities: CaptureCapabilities::default(),
        permissions: PermissionSnapshot::default(),
        diagnostics: Default::default(),
        limitations: Vec::new(),
        sources: Vec::new(),
    };
    Engine {
        session: Some(RecordingSession::prepare(request, snapshot).expect("prepare empty session")),
        ..Engine::default()
    }
}

fn assert_transition(engine: &mut Engine, command: Command) {
    let response = dispatch(engine, command);
    assert!(!response.ok, "{response:?}");
    assert_eq!(
        response.error.as_ref().map(|error| error.code.as_str()),
        Some("invalid-transition")
    );
}

#[test]
fn prepared_state_blocks_invalid_transitions_and_preview_without_changing_status() {
    let output = tempfile::tempdir().expect("temporary output");
    let mut engine = prepared_engine(output.path());
    let before = dispatch(&mut engine, Command::Status);
    assert_eq!(
        before.result.as_ref().map(|value| &value["state"]),
        Some(&serde_json::json!("armed"))
    );
    assert_transition(&mut engine, Command::Pause);
    assert_transition(&mut engine, Command::Resume);
    assert_transition(&mut engine, Command::StartSystemAudioPreview);
    let after = dispatch(&mut engine, Command::Status);
    assert_eq!(after.result, before.result);
    #[cfg(feature = "native-media")]
    assert_transition(&mut engine, Command::NativeMediaStart);
    assert!(dispatch(&mut engine, Command::Cancel).ok);
}

#[test]
fn recording_and_paused_states_enforce_transition_matrix_and_keep_session_identity() {
    let output = tempfile::tempdir().expect("temporary output");
    let mut engine = prepared_engine(output.path());
    let session_id = dispatch(&mut engine, Command::Status)
        .result
        .expect("status")["sessionId"]
        .clone();
    let started = dispatch(&mut engine, Command::Start);
    assert!(started.ok, "{started:?}");
    assert_eq!(
        started.result.as_ref().map(|value| &value["state"]),
        Some(&serde_json::json!("recording"))
    );
    assert_eq!(
        started.result.as_ref().map(|value| &value["sessionId"]),
        Some(&session_id)
    );
    assert_transition(&mut engine, Command::Start);
    assert_transition(&mut engine, Command::Resume);
    assert_transition(&mut engine, Command::StartSystemAudioPreview);

    let paused = dispatch(&mut engine, Command::Pause);
    assert!(paused.ok, "{paused:?}");
    assert_eq!(
        paused.result.as_ref().map(|value| &value["state"]),
        Some(&serde_json::json!("paused"))
    );
    assert_transition(&mut engine, Command::Pause);
    assert_transition(&mut engine, Command::Start);
    assert_transition(&mut engine, Command::StartSystemAudioPreview);

    let resumed = dispatch(&mut engine, Command::Resume);
    assert!(resumed.ok, "{resumed:?}");
    assert_eq!(
        resumed.result.as_ref().map(|value| &value["state"]),
        Some(&serde_json::json!("recording"))
    );
    let stopped = dispatch(&mut engine, Command::Stop);
    assert!(stopped.ok, "{stopped:?}");
    assert_eq!(
        stopped.result.as_ref().map(|value| &value["state"]),
        Some(&serde_json::json!("completed"))
    );
    assert_eq!(
        stopped.result.as_ref().map(|value| &value["sessionId"]),
        Some(&session_id)
    );
    assert!(
        stopped
            .result
            .as_ref()
            .and_then(|value| value["manifestPath"].as_str())
            .is_some_and(|path| std::path::Path::new(path).exists())
    );
}

#[test]
fn completed_state_rejects_reactivation_and_can_discard() {
    let output = tempfile::tempdir().expect("temporary output");
    let mut engine = prepared_engine(output.path());
    assert!(dispatch(&mut engine, Command::Start).ok);
    assert!(dispatch(&mut engine, Command::Stop).ok);
    for command in [Command::Start, Command::Pause, Command::Resume] {
        assert_transition(&mut engine, command);
    }
    assert!(dispatch(&mut engine, Command::Stop).ok);
    let discarded = dispatch(&mut engine, Command::Discard);
    assert!(discarded.ok, "{discarded:?}");
    assert_eq!(
        discarded.result.as_ref().map(|value| &value["state"]),
        Some(&serde_json::json!("idle"))
    );
    assert_eq!(
        dispatch(&mut engine, Command::Status)
            .result
            .expect("status")["state"],
        "idle"
    );
}

#[cfg(feature = "native-media")]
#[test]
fn legacy_session_blocks_native_prepare_before_worker_creation() {
    use capture::protocol::{NativeAudioSelection, NativeCameraSelection, NativeMediaConfig};
    let output = tempfile::tempdir().expect("temporary output");
    let mut engine = prepared_engine(output.path());
    let native = NativeMediaConfig {
        output_dir: output.path().join("native"),
        camera: NativeCameraSelection::Disabled,
        microphone: NativeAudioSelection::Disabled,
        system_audio: NativeAudioSelection::Disabled,
    };
    for state in 0..3 {
        let response = dispatch(
            &mut engine,
            Command::NativeMediaPrepare {
                config: native.clone(),
            },
        );
        assert_eq!(
            response.error.as_ref().map(|error| error.code.as_str()),
            Some("invalid-transition")
        );
        assert!(!native.output_dir.exists());
        if state == 0 {
            assert!(dispatch(&mut engine, Command::Start).ok);
        }
        if state == 1 {
            assert!(dispatch(&mut engine, Command::Pause).ok);
        }
    }
    assert!(dispatch(&mut engine, Command::Discard).ok);
}
