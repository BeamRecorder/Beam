use std::io::{self, BufReader, Write};

use capture::{
    catalog::{NativeCatalog, SourceCatalog},
    protocol::{Command, RequestEnvelope, ResponseEnvelope, read_json_line, write_json_line},
    session::{RecordingSession, SessionState},
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
}

impl Engine {
    fn state(&self) -> SessionState {
        self.session
            .as_ref()
            .map_or(SessionState::Idle, RecordingSession::state)
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
            let snapshot = NativeCatalog::default().snapshot()?;
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
