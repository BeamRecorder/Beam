use std::{
    collections::HashMap,
    io::{self, BufReader, Write},
};

#[cfg(any(windows, target_os = "macos"))]
use capture::{
    backends::{audio_level::NativeAudioLevelMonitor, camera_preview::CameraPreview},
    model::SourceId,
};
use capture::{
    catalog::{NativeCatalog, SourceCatalog},
    protocol::{Command, RequestEnvelope, ResponseEnvelope, read_json_line, write_json_line},
    session::{RecordingSession, SessionState},
};
#[cfg(any(windows, target_os = "macos"))]
use uuid::Uuid;

fn main() {
    let code = match run() {
        Ok(()) => 0,
        Err(error) => {
            let _result = writeln!(io::stderr().lock(), "{error}");
            1
        }
    };
    std::process::exit(code);
}

fn run() -> Result<(), capture::CaptureError> {
    let mut reader = BufReader::new(io::stdin().lock());
    let mut output = io::stdout().lock();
    let mut engine = Engine::default();
    loop {
        let request = match read_json_line::<RequestEnvelope>(&mut reader) {
            Ok(Some(request)) => request,
            Ok(None) => break,
            Err(error) => {
                write_json_line(
                    &mut output,
                    &ResponseEnvelope::failure("unknown", "invalid-json", error.to_string()),
                )?;
                continue;
            }
        };
        let response = handle(request, &mut engine);
        write_json_line(&mut output, &response)?;
    }
    Ok(())
}

#[derive(Default)]
struct Engine {
    session: Option<RecordingSession>,
    #[cfg(any(windows, target_os = "macos"))]
    camera_preview: Option<CameraPreview>,
    #[cfg(any(windows, target_os = "macos"))]
    audio_levels: HashMap<String, NativeAudioLevelMonitor>,
}

impl Engine {
    fn state(&self) -> SessionState {
        self.session
            .as_ref()
            .map_or(SessionState::Idle, RecordingSession::state)
    }

    #[cfg(any(windows, target_os = "macos"))]
    fn close_device_monitors(&mut self) -> Result<(), capture::CaptureError> {
        self.audio_levels.clear();
        if let Some(preview) = self.camera_preview.take() {
            preview.stop()?;
        }
        Ok(())
    }
}

fn handle(request: RequestEnvelope, engine: &mut Engine) -> ResponseEnvelope {
    let result: Result<serde_json::Value, capture::CaptureError> = (|| match request.command {
        Command::Discover => {
            serde_json::to_value(NativeCatalog::default().snapshot()?).map_err(Into::into)
        }
        Command::Capabilities => {
            serde_json::to_value(NativeCatalog::default().snapshot()?.capabilities)
                .map_err(Into::into)
        }
        Command::Permissions => {
            serde_json::to_value(NativeCatalog::default().snapshot()?.permissions)
                .map_err(Into::into)
        }
        Command::Formats { source } => {
            let snapshot = NativeCatalog::default().snapshot()?;
            serde_json::to_value(
                &snapshot
                    .sources
                    .iter()
                    .find(|entry| entry.id.as_str() == source)
                    .ok_or(capture::CaptureError::SourceNotFound(source))?
                    .capabilities
                    .formats,
            )
            .map_err(Into::into)
        }
        Command::Prepare { config } => {
            if engine.session.as_ref().is_some_and(|session| {
                !matches!(
                    session.state(),
                    SessionState::Completed | SessionState::Failed
                )
            }) {
                return Err(capture::CaptureError::InvalidTransition {
                    from: format!("{:?}", engine.state()),
                    to: "Preparing".into(),
                });
            }
            #[cfg(any(windows, target_os = "macos"))]
            engine.close_device_monitors()?;
            let snapshot = NativeCatalog::default().snapshot()?;
            #[cfg(any(windows, target_os = "macos"))]
            let session = RecordingSession::prepare_with_camera_preview(*config, snapshot, None)?;
            #[cfg(not(any(windows, target_os = "macos")))]
            let session = RecordingSession::prepare(*config, snapshot)?;
            let value = serde_json::json!({
                "state": session.state(),
                "sessionId": session.session_id(),
                "manifestPath": session.manifest_path(),
            });
            engine.session = Some(session);
            Ok(value)
        }
        Command::Start => {
            let session = required_session(engine)?;
            session.start()?;
            session_value(session)
        }
        Command::Pause => {
            let session = required_session(engine)?;
            session.pause()?;
            session_value(session)
        }
        Command::Resume => {
            let session = required_session(engine)?;
            session.resume()?;
            session_value(session)
        }
        Command::Cancel => {
            let session =
                engine
                    .session
                    .take()
                    .ok_or(capture::CaptureError::InvalidTransition {
                        from: "Idle".into(),
                        to: "Cancelled".into(),
                    })?;
            session.cancel()?;
            Ok(serde_json::json!({ "state": "idle" }))
        }
        Command::Discard => {
            let session =
                engine
                    .session
                    .take()
                    .ok_or(capture::CaptureError::InvalidTransition {
                        from: "Idle".into(),
                        to: "Discarded".into(),
                    })?;
            let session_id = session.session_id();
            session.discard()?;
            Ok(serde_json::json!({ "state": "idle", "sessionId": session_id }))
        }
        Command::Stop => {
            let session = required_session(engine)?;
            let manifest_path = session.stop()?;
            Ok(serde_json::json!({
                "state": session.state(),
                "sessionId": session.session_id(),
                "manifestPath": manifest_path,
            }))
        }
        Command::Status => Ok(serde_json::json!({
            "state": engine.state(),
            "sessionId": engine.session.as_ref().map(RecordingSession::session_id),
            "manifestPath": engine.session.as_ref().map(RecordingSession::manifest_path),
        })),
        Command::PreviewStart { source } => {
            #[cfg(any(windows, target_os = "macos"))]
            {
                if let Some(preview) = engine.camera_preview.take() {
                    preview.stop()?;
                }
                let source = SourceId::new(source)?;
                let preview = CameraPreview::start(&source)?;
                let url = preview.url().to_owned();
                engine.camera_preview = Some(preview);
                Ok(serde_json::json!({ "url": url }))
            }
            #[cfg(not(any(windows, target_os = "macos")))]
            {
                let _ = source;
                Err(capture::CaptureError::Unsupported(
                    "native camera preview is unavailable on this platform".into(),
                ))
            }
        }
        Command::PreviewStop => {
            #[cfg(any(windows, target_os = "macos"))]
            if let Some(preview) = engine.camera_preview.take() {
                preview.stop()?;
            }
            Ok(serde_json::json!({ "state": "idle" }))
        }
        Command::AudioLevelStart { source } => {
            #[cfg(any(windows, target_os = "macos"))]
            {
                if engine.session.as_ref().is_some_and(|session| {
                    matches!(session.state(), SessionState::Recording | SessionState::Paused)
                }) {
                    return Err(capture::CaptureError::InvalidTransition {
                        from: format!("{:?}", engine.state()),
                        to: "AudioLevelMonitoring".into(),
                    });
                }
                let monitor = NativeAudioLevelMonitor::start(&source)?;
                let id = Uuid::now_v7().to_string();
                engine.audio_levels.insert(id.clone(), monitor);
                Ok(serde_json::json!({ "monitorId": id }))
            }
            #[cfg(not(any(windows, target_os = "macos")))]
            {
                let _ = source;
                Err(capture::CaptureError::Unsupported(
                    "native audio level monitoring is unavailable on this platform".into(),
                ))
            }
        }
        Command::AudioLevelRead { monitor } => {
            #[cfg(any(windows, target_os = "macos"))]
            {
                let value = engine
                    .audio_levels
                    .get(&monitor)
                    .ok_or_else(|| capture::CaptureError::SourceNotFound(monitor))?
                    .take_level();
                Ok(serde_json::json!({ "level": value }))
            }
            #[cfg(not(any(windows, target_os = "macos")))]
            {
                let _ = monitor;
                Err(capture::CaptureError::Unsupported(
                    "native audio level monitoring is unavailable on this platform".into(),
                ))
            }
        }
        Command::AudioLevelStop { monitor } => {
            #[cfg(any(windows, target_os = "macos"))]
            {
                engine.audio_levels.remove(&monitor);
            }
            #[cfg(not(any(windows, target_os = "macos")))]
            let _ = monitor;
            Ok(serde_json::json!({ "state": "stopped" }))
        }
    })();
    match result {
        Ok(value) => ResponseEnvelope::success(request.id, value),
        Err(error) => ResponseEnvelope::failure(request.id, "capture-error", error.to_string()),
    }
}

fn required_session(engine: &mut Engine) -> Result<&mut RecordingSession, capture::CaptureError> {
    engine
        .session
        .as_mut()
        .ok_or(capture::CaptureError::InvalidTransition {
            from: "Idle".into(),
            to: "session command".into(),
        })
}

fn session_value(session: &RecordingSession) -> Result<serde_json::Value, capture::CaptureError> {
    Ok(serde_json::json!({
        "state": session.state(),
        "sessionId": session.session_id(),
        "manifestPath": session.manifest_path(),
    }))
}
