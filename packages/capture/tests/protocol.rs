#![allow(clippy::expect_used)]

use std::{
    io::{BufRead, BufReader, Cursor, Write},
    process::{Command, Stdio},
};

use capture::{
    model::{CaptureRequest, CursorSelection, ProjectId, RecordingSettings},
    protocol::{RequestEnvelope, ResponseEnvelope, read_json_line, write_json_line},
};

#[test]
fn json_lines_roundtrip_and_eof() {
    let request: RequestEnvelope =
        serde_json::from_str(r#"{"id":"1","command":"status"}"#).expect("request");
    let mut output = Vec::new();
    write_json_line(&mut output, &request).expect("write");
    let mut reader = BufReader::new(Cursor::new(output));
    let decoded: RequestEnvelope = read_json_line(&mut reader).expect("read").expect("line");
    assert_eq!(decoded.id, "1");
    assert!(
        read_json_line::<RequestEnvelope>(&mut reader)
            .expect("eof")
            .is_none()
    );
}

#[test]
fn engine_eof_finalizes_an_active_session() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let project_id = ProjectId::new();
    let request = CaptureRequest {
        project_id,
        screen: None,
        cursor: CursorSelection::Disabled,
        recording: RecordingSettings {
            output_root: temporary.path().to_owned(),
            minimum_free_bytes: 0,
            ..RecordingSettings::default()
        },
        failure_policy: capture::model::FailurePolicy::FailFast,
        region: None,
        excluded_process_id: None,
    };
    let mut child = Command::new(env!("CARGO_BIN_EXE_capture-engine"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn capture engine");
    let mut stdin = child.stdin.take().expect("engine stdin");
    let stdout = child.stdout.take().expect("engine stdout");
    let mut responses = BufReader::new(stdout);
    writeln!(
        stdin,
        "{}",
        serde_json::json!({"id":"prepare","command":"prepare","config":request})
    )
    .expect("prepare command");
    stdin.flush().expect("flush prepare");
    let prepared = read_response(&mut responses);
    assert!(prepared.ok, "prepare failed: {:?}", prepared.error);
    let session_id = prepared.result.expect("prepare result")["sessionId"]
        .as_str()
        .expect("session ID")
        .to_owned();
    writeln!(stdin, "{{\"id\":\"start\",\"command\":\"start\"}}").expect("start command");
    stdin.flush().expect("flush start");
    assert!(read_response(&mut responses).ok);
    drop(stdin);
    assert!(child.wait().expect("wait for engine").success());

    let project = std::fs::read_dir(temporary.path())
        .expect("read projects")
        .flatten()
        .find(|entry| entry.file_name().to_string_lossy().starts_with("project-"))
        .expect("project directory")
        .path();
    let manifest = project
        .join(format!("session-{session_id}"))
        .join("manifest.json");
    assert!(
        manifest.exists(),
        "missing finalized manifest: {}",
        manifest.display()
    );
    let value: serde_json::Value =
        serde_json::from_slice(&std::fs::read(manifest).expect("read manifest"))
            .expect("parse manifest");
    assert_eq!(value["completed"], true);
}

fn read_response(reader: &mut impl BufRead) -> ResponseEnvelope {
    read_json_line(reader)
        .expect("read engine response")
        .expect("engine response")
}
