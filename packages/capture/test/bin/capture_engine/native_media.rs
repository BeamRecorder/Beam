#![cfg(test)]
#![allow(clippy::expect_used, clippy::panic)]

use capture::protocol::{NativeAudioSelection, NativeCameraSelection, NativeMediaConfig};

use super::{
    NativeMediaController, Worker, WorkerCommand, audio_selection, devices, failed_status,
    manifest_path, run_worker, session_config,
};

fn disabled_config(output_dir: std::path::PathBuf) -> NativeMediaConfig {
    NativeMediaConfig {
        output_dir,
        camera: NativeCameraSelection::Disabled,
        microphone: NativeAudioSelection::Disabled,
        system_audio: NativeAudioSelection::Disabled,
    }
}

#[test]
fn idle_operations_are_stable_and_do_not_create_a_worker() -> Result<(), capture::CaptureError> {
    let mut controller = NativeMediaController::default();
    assert_eq!(controller.status()?["state"], "idle");
    assert!(!controller.is_active());
    for operation in [NativeMediaController::start, NativeMediaController::stop] {
        let error = operation(&mut controller).err();
        assert!(matches!(
            error,
            Some(capture::CaptureError::InvalidTransition { .. })
        ));
    }
    assert_eq!(controller.status()?["state"], "idle");
    Ok(())
}

#[test]
fn selection_conversion_preserves_each_cross_platform_variant() {
    use beam_media_session::{AudioSelection, CameraSelection};

    let converted = session_config(NativeMediaConfig {
        output_dir: "session".into(),
        camera: NativeCameraSelection::FirstAvailable {
            width: 640,
            height: 480,
            fps: 24,
        },
        microphone: NativeAudioSelection::Default,
        system_audio: NativeAudioSelection::Device {
            id: "loopback-1".into(),
        },
    });
    assert_eq!(converted.output_dir, std::path::PathBuf::from("session"));
    assert!(matches!(
        converted.camera,
        CameraSelection::FirstAvailable {
            width: 640,
            height: 480,
            fps: 24
        }
    ));
    assert!(matches!(converted.microphone, AudioSelection::Default));
    assert!(matches!(converted.system_audio, AudioSelection::Device(id) if id == "loopback-1"));

    let converted = session_config(NativeMediaConfig {
        output_dir: "other-session".into(),
        camera: NativeCameraSelection::Device {
            id: "camera-1".into(),
            width: 1920,
            height: 1080,
            fps: 60,
        },
        microphone: NativeAudioSelection::Disabled,
        system_audio: NativeAudioSelection::Disabled,
    });
    assert!(matches!(converted.camera, CameraSelection::Device(request)
        if request.device_id == "camera-1" && request.width == 1920 && request.height == 1080 && request.fps == 60));
    assert!(matches!(
        audio_selection(NativeAudioSelection::Disabled),
        AudioSelection::Disabled
    ));
}

#[test]
fn device_discovery_keeps_categories_and_errors_separate() {
    let result = devices();
    for key in ["cameras", "microphones", "systemOutputs"] {
        assert!(result[key].is_array(), "{key} must always be a list");
    }
    for key in ["cameras", "microphones", "systemOutputs"] {
        assert!(
            result["errors"].get(key).is_some(),
            "{key} must expose its own discovery error"
        );
    }
}

#[test]
fn failed_prepare_can_be_retried_with_a_new_directory() -> Result<(), Box<dyn std::error::Error>> {
    let output = tempfile::tempdir()?;
    let occupied = output.path().join("occupied");
    std::fs::write(&occupied, b"not a directory")?;
    let mut controller = NativeMediaController::default();
    assert!(controller.prepare(disabled_config(occupied)).is_err());
    assert!(!controller.is_active());
    assert_eq!(controller.status()?["state"], "idle");

    let armed = controller.prepare(disabled_config(output.path().join("session")))?;
    assert_eq!(armed["state"], "armed");
    assert!(controller.is_active());
    let stopped = controller.stop()?;
    assert_eq!(stopped["state"], "failed");
    assert_eq!(stopped["completed"], false);
    assert!(!controller.is_active());
    Ok(())
}

#[test]
fn stop_before_start_persists_an_interrupted_manifest_and_allows_next_prepare()
-> Result<(), Box<dyn std::error::Error>> {
    let output = tempfile::tempdir()?;
    let first = output.path().join("first");
    let mut controller = NativeMediaController::default();
    let armed = controller.prepare(disabled_config(first.clone()))?;
    assert_eq!(armed["state"], "armed");
    let stopped = controller.stop()?;
    assert_eq!(stopped["state"], "failed");
    assert_eq!(stopped["sessionId"], armed["sessionId"]);
    assert_eq!(stopped["manifestPath"], armed["manifestPath"]);
    assert!(!controller.is_active());
    let manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(first.join("manifest.json"))?)?;
    assert_eq!(manifest["completed"], false);
    assert!(manifest["warnings"].as_array().is_some_and(|warnings| {
        warnings
            .iter()
            .any(|warning| warning == "stopped before native media start")
    }));
    assert_eq!(controller.status()?, stopped);
    let second = controller.prepare(disabled_config(output.path().join("second")))?;
    assert_ne!(second["sessionId"], stopped["sessionId"]);
    controller.stop()?;
    Ok(())
}

#[test]
fn native_media_protocol_runs_without_hardware_and_preserves_manifest()
-> Result<(), Box<dyn std::error::Error>> {
    let output = tempfile::tempdir()?;
    let mut controller = NativeMediaController::default();
    let config = NativeMediaConfig {
        output_dir: output.path().join("session"),
        camera: NativeCameraSelection::Disabled,
        microphone: NativeAudioSelection::Disabled,
        system_audio: NativeAudioSelection::Disabled,
    };

    let armed = controller.prepare(config.clone())?;
    assert_eq!(armed["state"], "armed");
    assert!(controller.prepare(config).is_err());
    assert_eq!(controller.status()?["state"], "armed");

    let recording = controller.start()?;
    assert_eq!(recording["state"], "recording");
    assert!(controller.start().is_err());
    assert_eq!(controller.status()?["state"], "recording");
    let stopped = controller.stop()?;
    assert_eq!(stopped["state"], "failed");
    assert_eq!(stopped["completed"], false);
    assert!(output.path().join("session/manifest.json").exists());
    assert!(output.path().join("session/measurements.json").exists());
    assert_eq!(controller.status()?, stopped);
    Ok(())
}

#[test]
fn failed_finalization_releases_the_native_media_worker() -> Result<(), Box<dyn std::error::Error>>
{
    let output = tempfile::tempdir()?;
    let session_dir = output.path().join("session");
    let mut controller = NativeMediaController::default();
    controller.prepare(NativeMediaConfig {
        output_dir: session_dir.clone(),
        camera: NativeCameraSelection::Disabled,
        microphone: NativeAudioSelection::Disabled,
        system_audio: NativeAudioSelection::Disabled,
    })?;
    controller.start()?;
    std::fs::create_dir(session_dir.join("measurements.json"))?;

    assert!(controller.stop().is_err());
    assert!(!controller.is_active());
    let status = controller.status()?;
    assert_eq!(status["state"], "failed");
    assert!(
        status["error"]
            .as_str()
            .is_some_and(|error| error.contains("measurements"))
    );
    Ok(())
}

#[test]
fn engine_shutdown_finalizes_an_interrupted_native_session()
-> Result<(), Box<dyn std::error::Error>> {
    let output = tempfile::tempdir()?;
    let session_dir = output.path().join("session");
    let mut controller = NativeMediaController::default();
    controller.prepare(NativeMediaConfig {
        output_dir: session_dir.clone(),
        camera: NativeCameraSelection::Disabled,
        microphone: NativeAudioSelection::Disabled,
        system_audio: NativeAudioSelection::Disabled,
    })?;
    controller.start()?;
    drop(controller);

    let manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(session_dir.join("manifest.json"))?)?;
    assert_eq!(manifest["completed"], false);
    assert!(manifest["warnings"].as_array().is_some_and(|warnings| {
        warnings
            .iter()
            .any(|warning| warning == "capture engine closed")
    }));
    Ok(())
}

#[test]
fn failed_status_preserves_identity_and_tracks_even_from_sparse_status() {
    let previous = serde_json::json!({
        "sessionId": "session-9",
        "manifestPath": "/tmp/example/manifest.json",
        "tracks": [{"kind": "camera"}],
    });
    let failed = failed_status(&previous, "worker lost".into());
    assert_eq!(failed["state"], "failed");
    assert_eq!(failed["sessionId"], "session-9");
    assert_eq!(failed["manifestPath"], "/tmp/example/manifest.json");
    assert_eq!(failed["tracks"], previous["tracks"]);
    assert_eq!(failed["completed"], false);
    assert_eq!(failed["error"], "worker lost");
    assert_eq!(manifest_path(&previous), previous["manifestPath"]);
    assert!(manifest_path(&serde_json::Value::Null).is_null());
    assert!(failed_status(&serde_json::Value::Null, "missing".into())["sessionId"].is_null());
}

#[test]
fn worker_request_reports_command_or_reply_channel_disconnection() {
    use std::sync::mpsc;

    let (sender, receiver) = mpsc::channel();
    drop(receiver);
    let worker = Worker {
        commands: sender,
        thread: None,
    };
    let error = worker
        .request(WorkerCommand::Status)
        .expect_err("command channel closed");
    assert!(error.to_string().contains("worker stopped"));

    let (sender, receiver) = mpsc::channel();
    let responder = std::thread::spawn(move || {
        let WorkerCommand::Status(reply) = receiver.recv().expect("status request") else {
            panic!("unexpected command");
        };
        drop(reply);
    });
    let worker = Worker {
        commands: sender,
        thread: None,
    };
    let error = worker
        .request(WorkerCommand::Status)
        .expect_err("reply channel closed");
    assert!(error.to_string().contains("did not respond"));
    responder.join().expect("responder exit");
}

#[test]
fn worker_interruption_during_prepare_writes_manifest_without_hardware()
-> Result<(), Box<dyn std::error::Error>> {
    use std::sync::mpsc;

    let output = tempfile::tempdir()?;
    let path = output.path().join("session");
    let (commands, incoming) = mpsc::channel();
    let (ready, prepared) = mpsc::channel();
    drop(prepared);
    run_worker(disabled_config(path.clone()), incoming, ready);
    drop(commands);
    let manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(path.join("manifest.json"))?)?;
    assert_eq!(manifest["completed"], false);
    assert!(manifest["warnings"].as_array().is_some_and(|warnings| {
        warnings
            .iter()
            .any(|warning| warning == "capture engine closed during prepare")
    }));
    Ok(())
}
