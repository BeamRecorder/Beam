use std::io::Write;
#[test]
fn command_process_accepts_versioned_status_and_exits_on_eof() {
    let root = tempfile::tempdir().unwrap();
    let mut process = std::process::Command::new(env!("CARGO_BIN_EXE_beam-media-engine"))
        .arg(root.path())
        .env_remove("BEAM_PARENT_PID")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = process.stdin.take().unwrap();
    writeln!(
        input,
        "{{\"version\":1,\"id\":\"status\",\"command\":{{\"type\":\"status\"}}}}"
    )
    .unwrap();
    drop(input);
    let output = process.wait_with_output().unwrap();
    assert!(output.status.success());
    let response: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(response["result"]["state"], "idle");
}
