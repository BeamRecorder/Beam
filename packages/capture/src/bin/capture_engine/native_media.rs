use std::{
    sync::mpsc::{self, Receiver, Sender},
    thread::{self, JoinHandle},
    time::Duration,
};

use beam_camera::CameraRequest;
use beam_media_session::{AudioSelection, CameraSelection, MediaSession, SessionConfig};
use capture::{
    CaptureError,
    protocol::{NativeAudioSelection, NativeCameraSelection, NativeMediaConfig},
};
use serde_json::{Value, json};

enum WorkerCommand {
    Start(Sender<Result<Value, String>>),
    Stop(Sender<Result<Value, String>>),
    Status(Sender<Result<Value, String>>),
    Shutdown,
}

struct Worker {
    commands: Sender<WorkerCommand>,
    thread: Option<JoinHandle<()>>,
}

impl Worker {
    fn request(
        &self,
        command: impl FnOnce(Sender<Result<Value, String>>) -> WorkerCommand,
    ) -> Result<Value, CaptureError> {
        let (reply, response) = mpsc::channel();
        self.commands
            .send(command(reply))
            .map_err(|_| CaptureError::Backend("native media worker stopped".into()))?;
        response
            .recv()
            .map_err(|_| CaptureError::Backend("native media worker did not respond".into()))?
            .map_err(CaptureError::Backend)
    }
}

impl Drop for Worker {
    fn drop(&mut self) {
        let _ = self.commands.send(WorkerCommand::Shutdown);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[derive(Default)]
pub(super) struct NativeMediaController {
    worker: Option<Worker>,
    last_status: Option<Value>,
}

impl NativeMediaController {
    pub(crate) fn is_active(&self) -> bool {
        self.worker.is_some()
    }

    pub(crate) fn prepare(&mut self, config: NativeMediaConfig) -> Result<Value, CaptureError> {
        if self.is_active() {
            return Err(CaptureError::InvalidTransition {
                from: "NativeMediaActive".into(),
                to: "NativeMediaPrepare".into(),
            });
        }
        let (commands, incoming) = mpsc::channel();
        let (ready, prepared) = mpsc::channel();
        let thread = thread::Builder::new()
            .name("native-media-session".into())
            .spawn(move || run_worker(config, incoming, ready))
            .map_err(|error| {
                CaptureError::Backend(format!("native media worker failed: {error}"))
            })?;
        let worker = Worker {
            commands,
            thread: Some(thread),
        };
        let status = prepared
            .recv()
            .map_err(|_| CaptureError::Backend("native media prepare did not respond".into()))?
            .map_err(CaptureError::Backend)?;
        self.last_status = Some(status.clone());
        self.worker = Some(worker);
        Ok(status)
    }

    pub(crate) fn start(&mut self) -> Result<Value, CaptureError> {
        let status = self.required_worker()?.request(WorkerCommand::Start)?;
        self.last_status = Some(status.clone());
        Ok(status)
    }

    pub(crate) fn stop(&mut self) -> Result<Value, CaptureError> {
        let result = self.required_worker()?.request(WorkerCommand::Stop);
        self.worker.take();
        match result {
            Ok(status) => {
                self.last_status = Some(status.clone());
                Ok(status)
            }
            Err(error) => {
                self.last_status = Some(failed_status(
                    self.last_status.as_ref().unwrap_or(&Value::Null),
                    error.to_string(),
                ));
                Err(error)
            }
        }
    }

    pub(crate) fn status(&mut self) -> Result<Value, CaptureError> {
        if let Some(worker) = &self.worker {
            let status = worker.request(WorkerCommand::Status)?;
            self.last_status = Some(status.clone());
            Ok(status)
        } else {
            Ok(self
                .last_status
                .clone()
                .unwrap_or_else(|| json!({ "state": "idle" })))
        }
    }

    fn required_worker(&self) -> Result<&Worker, CaptureError> {
        self.worker.as_ref().ok_or(CaptureError::InvalidTransition {
            from: "NativeMediaIdle".into(),
            to: "NativeMediaSession".into(),
        })
    }
}

pub(super) fn devices() -> Value {
    let cameras = beam_camera::list_cameras();
    let microphones = beam_audio::list_inputs();
    let system_outputs = beam_audio::list_system_outputs();
    let errors = json!({
        "cameras": cameras.as_ref().err().map(ToString::to_string),
        "microphones": microphones.as_ref().err().map(ToString::to_string),
        "systemOutputs": system_outputs.as_ref().err().map(ToString::to_string),
    });
    json!({
        "cameras": cameras.unwrap_or_default().into_iter().map(|device| json!({
            "id": device.id, "name": device.name
        })).collect::<Vec<_>>(),
        "microphones": microphones.unwrap_or_default().into_iter().map(|device| json!({
            "id": device.id, "name": device.name, "default": device.is_default
        })).collect::<Vec<_>>(),
        "systemOutputs": system_outputs.unwrap_or_default().into_iter().map(|device| json!({
            "id": device.id, "name": device.name, "default": device.is_default
        })).collect::<Vec<_>>(),
        "errors": errors,
    })
}

fn run_worker(
    config: NativeMediaConfig,
    commands: Receiver<WorkerCommand>,
    ready: Sender<Result<Value, String>>,
) {
    let session = match MediaSession::prepare(session_config(config)) {
        Ok(session) => session,
        Err(error) => {
            let _ = ready.send(Err(error.to_string()));
            return;
        }
    };
    let mut status = session_status("armed", &session);
    if ready.send(Ok(status.clone())).is_err() {
        let _ = session.interrupt("capture engine closed during prepare");
        return;
    }
    let mut session = Some(session);
    let mut recording = false;
    loop {
        if recording
            && let Some(active) = session.as_mut()
            && let Err(error) = active.poll()
        {
            let reason = format!("native media polling failed: {error}");
            if let Some(active) = session.take() {
                status = match active.interrupt(&reason) {
                    Ok(manifest) => json!({
                        "state": "failed",
                        "sessionId": manifest.session_id,
                        "manifestPath": manifest_path(&status),
                        "completed": false,
                        "tracks": manifest.tracks,
                        "error": reason,
                    }),
                    Err(finalize_error) => {
                        failed_status(&status, format!("{reason}; {finalize_error}"))
                    }
                };
            }
            recording = false;
        }
        let command = if recording {
            match commands.recv_timeout(Duration::from_millis(10)) {
                Ok(command) => Some(command),
                Err(mpsc::RecvTimeoutError::Timeout) => None,
                Err(mpsc::RecvTimeoutError::Disconnected) => Some(WorkerCommand::Shutdown),
            }
        } else {
            Some(commands.recv().unwrap_or(WorkerCommand::Shutdown))
        };
        match command {
            Some(WorkerCommand::Start(reply)) => {
                let result = if recording {
                    Err("native media session is already recording".into())
                } else if let Some(active) = session.as_mut() {
                    match active.start() {
                        Ok(()) => {
                            recording = true;
                            status = session_status("recording", active);
                            Ok(status.clone())
                        }
                        Err(error) => Err(error.to_string()),
                    }
                } else {
                    Err("native media session has already ended".into())
                };
                if !recording
                    && let Err(reason) = &result
                    && let Some(active) = session.take()
                {
                    let _ = active.interrupt(reason);
                    status = failed_status(&status, reason.clone());
                    recording = false;
                }
                let _ = reply.send(result);
            }
            Some(WorkerCommand::Stop(reply)) => {
                let result = if let Some(active) = session.take() {
                    let final_manifest = if recording {
                        active.stop()
                    } else {
                        active.interrupt("stopped before native media start")
                    };
                    match final_manifest {
                        Ok(manifest) => {
                            status = json!({
                                "state": if manifest.completed { "completed" } else { "failed" },
                                "sessionId": manifest.session_id,
                                "manifestPath": manifest_path(&status),
                                "completed": manifest.completed,
                                "tracks": manifest.tracks,
                            });
                            Ok(status.clone())
                        }
                        Err(error) => Err(error.to_string()),
                    }
                } else {
                    Ok(status.clone())
                };
                let _ = reply.send(result);
                break;
            }
            Some(WorkerCommand::Status(reply)) => {
                if let Some(active) = session.as_ref() {
                    status = session_status(if recording { "recording" } else { "armed" }, active);
                }
                let _ = reply.send(Ok(status.clone()));
            }
            Some(WorkerCommand::Shutdown) => {
                if let Some(active) = session.take() {
                    let _ = active.interrupt("capture engine closed");
                }
                break;
            }
            None => {}
        }
    }
}

fn manifest_path(status: &Value) -> Value {
    status.get("manifestPath").cloned().unwrap_or(Value::Null)
}

fn failed_status(previous: &Value, error: String) -> Value {
    json!({
        "state": "failed",
        "sessionId": previous.get("sessionId"),
        "manifestPath": previous.get("manifestPath"),
        "completed": false,
        "tracks": previous.get("tracks"),
        "error": error,
    })
}

fn session_status(state: &str, session: &MediaSession) -> Value {
    json!({
        "state": state,
        "sessionId": session.manifest().session_id,
        "manifestPath": session.manifest_path(),
        "completed": false,
        "tracks": session.manifest().tracks,
    })
}

fn session_config(config: NativeMediaConfig) -> SessionConfig {
    SessionConfig {
        output_dir: config.output_dir,
        camera: match config.camera {
            NativeCameraSelection::Disabled => CameraSelection::Disabled,
            NativeCameraSelection::FirstAvailable { width, height, fps } => {
                CameraSelection::FirstAvailable { width, height, fps }
            }
            NativeCameraSelection::Device {
                id,
                width,
                height,
                fps,
            } => CameraSelection::Device(CameraRequest {
                device_id: id,
                width,
                height,
                fps,
            }),
        },
        microphone: audio_selection(config.microphone),
        system_audio: audio_selection(config.system_audio),
    }
}

fn audio_selection(selection: NativeAudioSelection) -> AudioSelection {
    match selection {
        NativeAudioSelection::Disabled => AudioSelection::Disabled,
        NativeAudioSelection::Default => AudioSelection::Default,
        NativeAudioSelection::Device { id } => AudioSelection::Device(id),
    }
}

#[path = "../../../test/bin/capture_engine/native_media.rs"]
mod native_media_checks;
