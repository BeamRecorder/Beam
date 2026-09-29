#[test]
fn binary_rejects_missing_endpoint_on_stderr_only() {
    let result = std::process::Command::new(env!("CARGO_BIN_EXE_beam-editor-mcp"))
        .output()
        .unwrap();
    assert_eq!(result.status.code(), Some(2));
    assert!(result.stdout.is_empty());
    assert!(
        String::from_utf8(result.stderr)
            .unwrap()
            .contains("--endpoint")
    );
}
