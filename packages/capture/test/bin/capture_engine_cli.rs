#![allow(clippy::expect_used)]

#[cfg(not(target_os = "macos"))]
use std::{
    io::Write,
    process::{Command, Stdio},
};

#[cfg(not(target_os = "macos"))]
#[test]
fn engine_protocol_recovers_after_malformed_line_and_handles_multiple_requests() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_capture-engine"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("start capture-engine");
    let requests = [
        "{not-json}",
        r#"{"id":"one","command":"status"}"#,
        r#"{"id":"two","command":"formats","source":"missing-source"}"#,
        r#"{"id":"three","command":"input-access-status"}"#,
        r#"{"id":"four","command":"discover"}"#,
    ]
    .join("\n")
        + "\n";
    child
        .stdin
        .take()
        .expect("stdin")
        .write_all(requests.as_bytes())
        .expect("send requests");
    let output = child.wait_with_output().expect("engine exit");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let responses: Vec<serde_json::Value> = String::from_utf8(output.stdout)
        .expect("UTF-8 responses")
        .lines()
        .map(|line| serde_json::from_str(line).expect("JSON response"))
        .collect();
    assert_eq!(responses.len(), 5);
    assert_eq!(responses[0]["requestId"], "unknown");
    assert_eq!(responses[0]["error"]["code"], "invalid-json");
    assert_eq!(responses[1]["requestId"], "one");
    assert_eq!(responses[1]["ok"], true);
    assert_eq!(responses[2]["requestId"], "two");
    assert_eq!(responses[2]["ok"], false);
    assert_eq!(responses[2]["error"]["code"], "source-not-found");
    assert_eq!(responses[3]["requestId"], "three");
    assert_eq!(responses[3]["ok"], true);
    assert_eq!(responses[4]["requestId"], "four");
    assert_eq!(responses[4]["ok"], true);
    assert!(responses[4]["result"]["sources"].is_array());
}

#[cfg(not(target_os = "macos"))]
fn run_engine_lines(lines: &[&str]) -> Vec<serde_json::Value> {
    let mut child = Command::new(env!("CARGO_BIN_EXE_capture-engine"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("start capture-engine");
    child
        .stdin
        .take()
        .expect("stdin")
        .write_all((lines.join("\n") + "\n").as_bytes())
        .expect("send requests");
    let output = child.wait_with_output().expect("engine exit");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout)
        .expect("UTF-8 responses")
        .lines()
        .map(|line| serde_json::from_str(line).expect("JSON response"))
        .collect()
}

#[cfg(not(target_os = "macos"))]
#[test]
fn engine_protocol_recovers_from_multiple_schema_errors_without_losing_request_order() {
    let responses = run_engine_lines(&[
        "",
        r#"{"id":"missing-command"}"#,
        r#"{"id":"bad-command","command":"nonexistent"}"#,
        r#"{"id":"missing-field","command":"formats"}"#,
        r#"{"id":"bad-field","command":"resolve-display","x":"left","y":0}"#,
        r#"{"id":"after-errors","command":"status"}"#,
        r#"{"id":"unicode-é","command":"status"}"#,
    ]);
    assert_eq!(responses.len(), 7);
    for response in &responses[..5] {
        assert_eq!(response["requestId"], "unknown");
        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["code"], "invalid-json");
        assert!(response.get("result").is_none());
    }
    assert_eq!(responses[5]["requestId"], "after-errors");
    assert_eq!(responses[5]["result"]["state"], "idle");
    assert_eq!(responses[6]["requestId"], "unicode-é");
    assert_eq!(responses[6]["ok"], true);
}

#[cfg(not(target_os = "macos"))]
#[test]
fn engine_idle_commands_preserve_state_and_recover_after_application_errors() {
    let responses = run_engine_lines(&[
        r#"{"id":"cancel","command":"cancel"}"#,
        r#"{"id":"discard","command":"discard"}"#,
        r#"{"id":"start","command":"start"}"#,
        r#"{"id":"pause","command":"pause"}"#,
        r#"{"id":"resume","command":"resume"}"#,
        r#"{"id":"stop","command":"stop"}"#,
        r#"{"id":"preview-level","command":"system-audio-preview-level"}"#,
        r#"{"id":"stop-preview","command":"stop-system-audio-preview"}"#,
        r#"{"id":"status","command":"status"}"#,
    ]);
    assert_eq!(responses.len(), 9);
    for (response, id) in responses[..6]
        .iter()
        .zip(["cancel", "discard", "start", "pause", "resume", "stop"])
    {
        assert_eq!(response["requestId"], id);
        assert_eq!(response["error"]["code"], "invalid-transition");
    }
    for (response, id) in responses[6..8]
        .iter()
        .zip(["preview-level", "stop-preview"])
    {
        assert_eq!(response["requestId"], id);
        assert_eq!(response["result"]["level"], 0.0);
    }
    assert_eq!(responses[8]["requestId"], "status");
    assert_eq!(responses[8]["result"]["state"], "idle");
    assert!(responses[8]["result"]["sessionId"].is_null());
    assert_eq!(responses[8]["result"]["screenAvailable"], true);
}

#[cfg(not(any(target_os = "macos", windows)))]
#[test]
fn engine_unsupported_display_lookup_does_not_break_following_requests() {
    let responses = run_engine_lines(&[
        r#"{"id":"display","command":"resolve-display","x":-2147483648,"y":2147483647}"#,
        r#"{"id":"status","command":"status"}"#,
    ]);
    assert_eq!(responses.len(), 2);
    assert_eq!(responses[0]["requestId"], "display");
    assert_eq!(responses[0]["error"]["code"], "invalid-configuration");
    assert!(
        responses[0]["error"]["message"]
            .as_str()
            .is_some_and(|text| text.contains("Windows"))
    );
    assert_eq!(responses[1]["result"]["state"], "idle");
}

#[cfg(not(target_os = "macos"))]
#[test]
fn engine_protocol_exits_cleanly_on_immediate_eof_and_reports_partial_final_json() {
    let empty = Command::new(env!("CARGO_BIN_EXE_capture-engine"))
        .stdin(Stdio::null())
        .output()
        .expect("engine with EOF");
    assert!(
        empty.status.success(),
        "{}",
        String::from_utf8_lossy(&empty.stderr)
    );
    assert!(empty.stdout.is_empty());

    let mut child = Command::new(env!("CARGO_BIN_EXE_capture-engine"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("engine with partial final line");
    child
        .stdin
        .take()
        .expect("stdin")
        .write_all(br#"{"id":"partial","command":"status"#)
        .expect("write partial JSON");
    let result = child.wait_with_output().expect("engine exit");
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let responses: Vec<serde_json::Value> = String::from_utf8(result.stdout)
        .expect("UTF-8")
        .lines()
        .map(|line| serde_json::from_str(line).expect("JSON response"))
        .collect();
    assert_eq!(responses.len(), 1);
    assert_eq!(responses[0]["requestId"], "unknown");
    assert_eq!(responses[0]["error"]["code"], "invalid-json");
}
