use std::io::{self, BufReader, Write};

use capture::{
    catalog::{CatalogSnapshot, NativeCatalog, SourceCatalog},
    model::SystemAudioSelection,
    protocol::{Command, RequestEnvelope, ResponseEnvelope, read_json_line, write_json_line},
    session::{RecordingSession, SessionState},
    system_audio::SystemAudioMonitor,
};

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
    capture::parent_watch::install_parent_death_guard()?;
    let mut reader = BufReader::new(io::stdin().lock());
    let mut output = io::stdout().lock();
    let mut engine = Engine::default();
    loop {
        if capture::parent_watch::parent_death_requested() {
            break;
        }
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
    capture::input::shutdown_input_access();
    Ok(())
}

#[derive(Default)]
struct Engine {
    session: Option<RecordingSession>,
    catalog: NativeCatalog,
    system_audio_preview: Option<SystemAudioMonitor>,
    #[cfg(target_os = "linux")]
    last_portal_snapshot: Option<CatalogSnapshot>,
}

impl Engine {
    fn state(&self) -> SessionState {
        self.session
            .as_ref()
            .map_or(SessionState::Idle, RecordingSession::state)
    }

    fn stop_system_audio_preview(&mut self) -> Result<(), capture::CaptureError> {
        if let Some(mut preview) = self.system_audio_preview.take() {
            preview.stop()?;
        }
        Ok(())
    }
}

fn discover_snapshot(engine: &mut Engine) -> Result<CatalogSnapshot, capture::CaptureError> {
    let snapshot = engine.catalog.snapshot()?;
    #[cfg(target_os = "linux")]
    if snapshot.capabilities.portal_selection {
        engine.last_portal_snapshot = Some(snapshot.clone());
    }
    Ok(snapshot)
}

fn prepare_snapshot(engine: &mut Engine) -> Result<CatalogSnapshot, capture::CaptureError> {
    #[cfg(target_os = "linux")]
    if let Some(snapshot) = &engine.last_portal_snapshot {
        // Linux Portal sources are user intents rather than enumerated objects.
        // Reuse the successful discovery snapshot so a transient second
        // PipeWire probe cannot reject the same selection before the Portal
        // performs its own authoritative capability checks.
        return Ok(snapshot.clone());
    }
    discover_snapshot(engine)
}

fn handle(request: RequestEnvelope, engine: &mut Engine) -> ResponseEnvelope {
    let result: Result<serde_json::Value, capture::CaptureError> = (|| match request.command {
        Command::Discover => serde_json::to_value(discover_snapshot(engine)?).map_err(Into::into),
        Command::Capabilities => {
            serde_json::to_value(discover_snapshot(engine)?.capabilities).map_err(Into::into)
        }
        Command::Permissions => {
            serde_json::to_value(discover_snapshot(engine)?.permissions).map_err(Into::into)
        }
        Command::InputAccessStatus => {
            serde_json::to_value(capture::input::input_access_status()).map_err(Into::into)
        }
        Command::RequestInputAccess => {
            serde_json::to_value(capture::input::request_input_access()?).map_err(Into::into)
        }
        Command::Formats { source } => {
            let snapshot = discover_snapshot(engine)?;
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
            engine.stop_system_audio_preview()?;
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
            let snapshot = prepare_snapshot(engine)?;
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
            "systemAudioLevel": engine.session.as_ref().and_then(RecordingSession::system_audio_level),
        })),
        Command::StartSystemAudioPreview => {
            if !matches!(
                engine.state(),
                SessionState::Idle | SessionState::Completed | SessionState::Failed
            ) {
                return Err(capture::CaptureError::InvalidTransition {
                    from: format!("{:?}", engine.state()),
                    to: "SystemAudioPreview".into(),
                });
            }
            engine.stop_system_audio_preview()?;
            engine.system_audio_preview = Some(SystemAudioMonitor::open(
                SystemAudioSelection::DefaultOutput,
            )?);
            Ok(serde_json::json!({ "level": 0.0 }))
        }
        Command::SystemAudioPreviewLevel => Ok(serde_json::json!({
            "level": engine
                .system_audio_preview
                .as_ref()
                .map_or(0.0, SystemAudioMonitor::level),
        })),
        Command::StopSystemAudioPreview => {
            engine.stop_system_audio_preview()?;
            Ok(serde_json::json!({ "level": 0.0 }))
        }
    })();
    match result {
        Ok(value) => ResponseEnvelope::success(request.id, value),
        Err(error) => ResponseEnvelope::failure(request.id, error.code(), error.to_string()),
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

#[cfg(test)]
#[path = "capture_engine_tests/mod.rs"]
mod tests;
