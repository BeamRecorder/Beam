#[test]
fn binary_reports_invalid_command_as_structured_error() {
    let result = std::process::Command::new(env!("CARGO_BIN_EXE_beam-editor"))
        .arg("invalid")
        .output()
        .unwrap();
    assert_eq!(result.status.code(), Some(2));
    let value: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(value["type"], "error");
    assert_eq!(value["error"]["code"], "invalidRequest");
}

#[test]
fn binary_keeps_mcp_adapter_errors_off_stdout() {
    for command in ["mcp", "--stdio"] {
        let result = std::process::Command::new(env!("CARGO_BIN_EXE_beam-editor"))
            .arg(command)
            .output()
            .unwrap();
        assert_eq!(result.status.code(), Some(2));
        assert!(result.stdout.is_empty());
        assert!(!result.stderr.is_empty());
    }
}

#[test]
fn binary_reports_closed_output_on_stderr_without_panicking() {
    let mut child = std::process::Command::new(env!("CARGO_BIN_EXE_beam-editor"))
        .arg("schema")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    drop(child.stdout.take());
    let result = child.wait_with_output().unwrap();
    assert_eq!(result.status.code(), Some(2));
    assert!(!result.stderr.is_empty());
}

#[cfg(unix)]
fn owner(
    project: &std::path::Path,
) -> (
    std::process::Child,
    beam_editor_domain::protocol::OwnerReady,
) {
    use std::io::BufRead;
    let mut child = std::process::Command::new(env!("CARGO_BIN_EXE_beam-editor"))
        .args(["serve", "--project-root"])
        .arg(project)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    let stdout = child.stdout.take().unwrap();
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut line = String::new();
        std::io::BufReader::new(stdout)
            .read_line(&mut line)
            .unwrap();
        let _ = sender.send(line);
    });
    let line = match receiver.recv_timeout(std::time::Duration::from_secs(20)) {
        Ok(line) => line,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            panic!("owner readiness timed out: {error}");
        }
    };
    (child, serde_json::from_str(&line).unwrap())
}

#[cfg(unix)]
#[test]
fn binary_recovers_after_sigkill_without_displacing_a_live_owner() {
    use beam_editor_domain::protocol::{ErrorCode, Request, Response};
    use beam_editor_engine::broker::{Client, endpoint_for, token_file};
    use std::{
        fs,
        os::unix::fs::{MetadataExt, symlink},
        path::Path,
    };
    let root = tempfile::tempdir().unwrap();
    let project = root.path().join("p".repeat(160)).join("q".repeat(160));
    fs::create_dir_all(&project).unwrap();
    let alias = root.path().join("alias");
    symlink(&project, &alias).unwrap();
    let (mut first, ready) = owner(&project);
    let endpoint = Path::new(&ready.endpoint);
    assert_eq!(endpoint, endpoint_for(&project).unwrap());
    let old_token = fs::read(&ready.token_file).unwrap();
    let inode = fs::symlink_metadata(endpoint.with_extension("lock"))
        .unwrap()
        .ino();
    let old_client = Client::connect(endpoint).unwrap();
    let competitor = std::process::Command::new(env!("CARGO_BIN_EXE_beam-editor"))
        .args(["serve", "--project-root"])
        .arg(&alias)
        .output()
        .unwrap();
    assert_eq!(competitor.status.code(), Some(2));
    assert_eq!(fs::read(&ready.token_file).unwrap(), old_token);
    assert!(matches!(
        old_client.request(Request::Schema).unwrap(),
        Response::Schema { .. }
    ));
    first.kill().unwrap();
    first.wait().unwrap();
    assert!(endpoint.exists());
    assert!(Path::new(&ready.token_file).exists());
    let (mut second, recovered) = owner(&alias);
    assert_eq!(ready.endpoint, recovered.endpoint);
    assert_eq!(ready.token_file, recovered.token_file);
    assert_eq!(
        fs::symlink_metadata(endpoint.with_extension("lock"))
            .unwrap()
            .ino(),
        inode
    );
    assert_ne!(fs::read(&recovered.token_file).unwrap(), old_token);
    let Response::Error { error } = old_client.request(Request::Schema).unwrap() else {
        panic!("previous owner's token remained authorized");
    };
    assert!(matches!(error.code, ErrorCode::Unauthorized));
    assert!(matches!(
        Client::connect(endpoint)
            .unwrap()
            .request(Request::Schema)
            .unwrap(),
        Response::Schema { .. }
    ));
    drop(second.stdin.take());
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    loop {
        if let Some(status) = second.try_wait().unwrap() {
            assert!(status.success());
            break;
        }
        if std::time::Instant::now() >= deadline {
            second.kill().unwrap();
            second.wait().unwrap();
            panic!("owner did not stop after stdin closed");
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    assert!(!endpoint.exists());
    assert!(!token_file(endpoint).exists());
    let metadata = fs::symlink_metadata(endpoint.with_extension("lock")).unwrap();
    assert!(metadata.is_file());
    assert_eq!(metadata.mode() & 0o7777, 0o600);
}
