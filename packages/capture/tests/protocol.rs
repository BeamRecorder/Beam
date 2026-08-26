use std::{
    error::Error,
    io::{BufRead, BufReader, Cursor, Write},
    process::{Command, Stdio},
};

use capture::{
    model::{CaptureRequest, CursorSelection, ProjectId, RecordingSettings},
    protocol::{RequestEnvelope, ResponseEnvelope, read_json_line, write_json_line},
};

fn assert_command_roundtrip(command: &str) -> Result<(), Box<dyn Error>> {
    let expected = serde_json::json!({
        "id": format!("{command}-request"),
        "command": command,
    });
    let request: RequestEnvelope = serde_json::from_value(expected.clone())?;
    assert_eq!(serde_json::to_value(request)?, expected);
    Ok(())
}

#[test]
fn json_lines_roundtrip_and_eof() -> Result<(), Box<dyn Error>> {
    let request: RequestEnvelope = serde_json::from_str(r#"{"id":"1","command":"status"}"#)?;
    let mut output = Vec::new();
    write_json_line(&mut output, &request)?;
    let mut reader = BufReader::new(Cursor::new(output));
    let decoded: RequestEnvelope = read_json_line(&mut reader)?.ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "missing JSONL request")
    })?;
    assert_eq!(decoded.id, "1");
    assert!(read_json_line::<RequestEnvelope>(&mut reader)?.is_none());
    Ok(())
}

#[test]
fn start_system_audio_preview_command_roundtrips() -> Result<(), Box<dyn Error>> {
    assert_command_roundtrip("start-system-audio-preview")
}

#[test]
fn system_audio_preview_level_command_roundtrips() -> Result<(), Box<dyn Error>> {
    assert_command_roundtrip("system-audio-preview-level")
}

#[test]
fn stop_system_audio_preview_command_roundtrips() -> Result<(), Box<dyn Error>> {
    assert_command_roundtrip("stop-system-audio-preview")
}

#[test]
fn engine_eof_finalizes_an_active_session() -> Result<(), Box<dyn Error>> {
    let temporary = tempfile::tempdir()?;
    let project_id = ProjectId::new();
    let request = CaptureRequest {
        project_id,
        screen: None,
        system_audio: None,
        cursor: CursorSelection::Disabled,
        recording: RecordingSettings {
            output_root: temporary.path().to_owned(),
            minimum_free_bytes: 0,
            ..RecordingSettings::default()
        },
        failure_policy: capture::model::FailurePolicy::FailFast,
        region: None,
        excluded_process_id: None,
        excluded_window_handles: vec![],
    };
    let mut child = Command::new(env!("CARGO_BIN_EXE_capture-engine"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let mut stdin = child.stdin.take().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::BrokenPipe,
            "capture engine stdin unavailable",
        )
    })?;
    let stdout = child.stdout.take().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::BrokenPipe,
            "capture engine stdout unavailable",
        )
    })?;
    let mut responses = BufReader::new(stdout);
    writeln!(
        stdin,
        "{}",
        serde_json::json!({"id":"prepare","command":"prepare","config":request})
    )?;
    stdin.flush()?;
    let prepared = read_response(&mut responses)?;
    assert!(prepared.ok, "prepare failed: {:?}", prepared.error);
    let result = prepared.result.ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidData, "prepare result missing")
    })?;
    let session_id = result["sessionId"]
        .as_str()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidData, "session ID missing"))?
        .to_owned();
    writeln!(stdin, "{{\"id\":\"start\",\"command\":\"start\"}}")?;
    stdin.flush()?;
    assert!(read_response(&mut responses)?.ok);
    drop(stdin);
    assert!(child.wait()?.success());

    let project = std::fs::read_dir(temporary.path())?
        .flatten()
        .find(|entry| entry.file_name().to_string_lossy().starts_with("project-"))
        .map(|entry| entry.path())
        .ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::NotFound, "project directory missing")
        })?;
    let manifest = project
        .join(format!("session-{session_id}"))
        .join("manifest.json");
    assert!(
        manifest.exists(),
        "missing finalized manifest: {}",
        manifest.display()
    );
    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(manifest)?)?;
    assert_eq!(value["completed"], true);
    Ok(())
}

fn read_response(reader: &mut impl BufRead) -> Result<ResponseEnvelope, Box<dyn Error>> {
    read_json_line(reader)?.ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "engine response missing").into()
    })
}
