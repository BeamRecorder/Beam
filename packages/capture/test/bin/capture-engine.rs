#![cfg(test)]

use capture::protocol::{Command, RequestEnvelope};
#[cfg(target_os = "linux")]
use capture::{
    catalog::CatalogSnapshot,
    model::{CaptureCapabilities, PermissionSnapshot},
};

#[cfg(target_os = "linux")]
use super::prepare_snapshot;
use super::{Engine, handle};

#[path = "capture_engine/state_matrix.rs"]
mod state_matrix;

fn dispatch(engine: &mut Engine, command: Command) -> capture::protocol::ResponseEnvelope {
    handle(
        RequestEnvelope {
            id: "request-42".into(),
            command,
        },
        engine,
    )
}

#[cfg(windows)]
#[path = "capture_engine/windows.rs"]
mod windows_dpi;

#[test]
fn idle_status_reports_screen_available() {
    let mut engine = Engine::default();
    let response = handle(
        RequestEnvelope {
            id: "status-idle".into(),
            command: Command::Status,
        },
        &mut engine,
    );

    assert!(response.ok);
    assert_eq!(
        response
            .result
            .as_ref()
            .and_then(|result| result.get("screenAvailable"))
            .and_then(serde_json::Value::as_bool),
        Some(true)
    );
}

#[test]
fn idle_engine_rejects_session_transitions_and_reports_zero_preview_level() {
    let mut engine = Engine::default();
    for command in [
        Command::Start,
        Command::Pause,
        Command::Resume,
        Command::Stop,
        Command::Cancel,
        Command::Discard,
    ] {
        let response = dispatch(&mut engine, command);
        assert!(!response.ok);
        assert_eq!(response.request_id, "request-42");
        assert_eq!(
            response.error.as_ref().map(|error| error.code.as_str()),
            Some("invalid-transition")
        );
    }
    let level = dispatch(&mut engine, Command::SystemAudioPreviewLevel);
    assert!(level.ok);
    assert_eq!(
        level.result.as_ref().map(|value| &value["level"]),
        Some(&serde_json::json!(0.0))
    );
    let stopped = dispatch(&mut engine, Command::StopSystemAudioPreview);
    assert!(stopped.ok);
    assert_eq!(
        stopped.result.as_ref().map(|value| &value["level"]),
        Some(&serde_json::json!(0.0))
    );
}

#[cfg(not(windows))]
#[test]
fn display_resolution_is_explicitly_unavailable_on_non_windows_hosts() {
    let response = dispatch(
        &mut Engine::default(),
        Command::ResolveDisplay { x: -20, y: 0 },
    );
    assert!(!response.ok);
    assert_eq!(
        response.error.as_ref().map(|error| error.code.as_str()),
        Some("invalid-configuration")
    );
    assert!(
        response
            .error
            .as_ref()
            .is_some_and(|error| error.message.contains("Windows"))
    );
}

#[cfg(not(feature = "native-media"))]
#[test]
fn native_media_commands_fail_explicitly_when_feature_disabled() {
    use capture::protocol::{NativeAudioSelection, NativeCameraSelection, NativeMediaConfig};
    let mut engine = Engine::default();
    for command in [
        Command::NativeMediaDevices,
        Command::NativeMediaPrepare {
            config: NativeMediaConfig {
                output_dir: "unused".into(),
                camera: NativeCameraSelection::Disabled,
                microphone: NativeAudioSelection::Disabled,
                system_audio: NativeAudioSelection::Disabled,
            },
        },
        Command::NativeMediaStart,
        Command::NativeMediaStop,
        Command::NativeMediaStatus,
    ] {
        let response = dispatch(&mut engine, command);
        assert!(!response.ok);
        assert_eq!(response.request_id, "request-42");
        assert_eq!(
            response.error.as_ref().map(|error| error.code.as_str()),
            Some("unsupported-operation")
        );
    }
}

#[cfg(feature = "native-media")]
#[test]
fn native_media_engine_dispatches_lifecycle_and_excludes_legacy_prepare()
-> Result<(), Box<dyn std::error::Error>> {
    use capture::protocol::{NativeAudioSelection, NativeCameraSelection, NativeMediaConfig};
    let output = tempfile::tempdir()?;
    let mut engine = Engine::default();
    let idle = dispatch(&mut engine, Command::NativeMediaStatus);
    assert!(idle.ok);
    assert_eq!(
        idle.result.as_ref().map(|value| &value["state"]),
        Some(&serde_json::json!("idle"))
    );
    for command in [Command::NativeMediaStart, Command::NativeMediaStop] {
        let response = dispatch(&mut engine, command);
        assert!(!response.ok);
        assert_eq!(
            response.error.as_ref().map(|error| error.code.as_str()),
            Some("invalid-transition")
        );
    }

    let config = NativeMediaConfig {
        output_dir: output.path().join("session"),
        camera: NativeCameraSelection::Disabled,
        microphone: NativeAudioSelection::Disabled,
        system_audio: NativeAudioSelection::Disabled,
    };
    let prepared = dispatch(
        &mut engine,
        Command::NativeMediaPrepare {
            config: config.clone(),
        },
    );
    assert!(prepared.ok, "{prepared:?}");
    assert_eq!(
        prepared.result.as_ref().map(|value| &value["state"]),
        Some(&serde_json::json!("armed"))
    );
    let second = dispatch(&mut engine, Command::NativeMediaPrepare { config });
    assert!(!second.ok);
    assert_eq!(
        second.error.as_ref().map(|error| error.code.as_str()),
        Some("invalid-transition")
    );
    let legacy_preview = dispatch(&mut engine, Command::StartSystemAudioPreview);
    assert!(!legacy_preview.ok);
    assert_eq!(
        legacy_preview
            .error
            .as_ref()
            .map(|error| error.code.as_str()),
        Some("invalid-transition")
    );

    let started = dispatch(&mut engine, Command::NativeMediaStart);
    assert!(started.ok, "{started:?}");
    assert_eq!(
        started.result.as_ref().map(|value| &value["state"]),
        Some(&serde_json::json!("recording"))
    );
    let stopped = dispatch(&mut engine, Command::NativeMediaStop);
    assert!(stopped.ok, "{stopped:?}");
    assert_eq!(
        stopped.result.as_ref().map(|value| &value["state"]),
        Some(&serde_json::json!("failed"))
    );
    let status = dispatch(&mut engine, Command::NativeMediaStatus);
    assert_eq!(status.result, stopped.result);
    Ok(())
}

#[cfg(feature = "native-media")]
#[test]
fn native_media_devices_response_is_well_formed() {
    let result = dispatch(&mut Engine::default(), Command::NativeMediaDevices);
    assert!(result.ok, "{result:?}");
    let Some(value) = result.result else {
        return;
    };
    for category in ["cameras", "microphones", "systemOutputs"] {
        assert!(value[category].is_array());
        assert!(value["errors"].get(category).is_some());
    }
}

#[cfg(target_os = "linux")]
#[test]
fn prepare_reuses_the_successful_portal_discovery_snapshot() -> Result<(), capture::CaptureError> {
    let discovered = CatalogSnapshot {
        generation: 42,
        created_at_utc: "2026-08-15T00:00:00Z".into(),
        capabilities: CaptureCapabilities {
            display_capture: true,
            window_capture: true,
            portal_selection: true,
            ..CaptureCapabilities::default()
        },
        permissions: PermissionSnapshot::default(),
        diagnostics: Default::default(),
        limitations: vec!["discovered once".into()],
        sources: Vec::new(),
    };
    let mut engine = Engine {
        last_portal_snapshot: Some(discovered.clone()),
        ..Engine::default()
    };

    let prepared = prepare_snapshot(&mut engine)?;

    assert_eq!(prepared, discovered);
    Ok(())
}
