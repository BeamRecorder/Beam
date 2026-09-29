#[path = "args.rs"]
mod args;
#[path = "main.rs"]
mod main;
#[path = "types.rs"]
mod types;
use beam_editor_cli::{execute, types::Invocation};
#[test]
fn schema_command_and_output_failure_are_real() {
    let mut output = Vec::new();
    assert_eq!(
        execute(Invocation::Schema, &mut std::io::empty(), &mut output).unwrap(),
        0
    );
    let schema: serde_json::Value = serde_json::from_slice(&output).unwrap();
    assert!(schema["definitions"]["Transaction"].is_object());
    struct Broken;
    impl std::io::Write for Broken {
        fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
            Err(std::io::Error::other("broken"))
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    assert!(execute(Invocation::Schema, &mut std::io::empty(), &mut Broken).is_err());
}
#[test]
fn call_missing_owner_fails_without_creating_documents() {
    let root = tempfile::tempdir().unwrap();
    let invocation = Invocation::Call {
        endpoint: root.path().join("missing.socket"),
        request: beam_editor_domain::protocol::Request::Discovery,
    };
    assert!(execute(invocation, &mut std::io::empty(), &mut Vec::new()).is_err());
    assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 0);
}
#[test]
fn serve_bad_source_fails_before_starting_owner() {
    let root = tempfile::tempdir().unwrap();
    let invocation = Invocation::Serve(beam_editor_cli::types::ServeOptions {
        endpoint: Some(root.path().join("owner.socket")),
        project: root.path().join("project"),
        sources: vec![root.path().join("missing.mov")],
        destination: None,
    });
    assert!(execute(invocation, &mut std::io::empty(), &mut Vec::new()).is_err());
    assert!(!root.path().join("owner.socket").exists());
}

#[test]
fn serve_issues_real_grants_and_mcp_routes_protocol_without_a_project() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("source.bin");
    std::fs::write(&source, b"source").unwrap();
    let destination = root.path().join("exports");
    std::fs::create_dir(&destination).unwrap();
    let mut output = Vec::new();
    let invocation = Invocation::Serve(beam_editor_cli::types::ServeOptions {
        endpoint: None,
        project: root.path().join("project"),
        sources: vec![source],
        destination: Some(destination),
    });
    assert_eq!(
        execute(invocation, &mut std::io::empty(), &mut output).unwrap(),
        0
    );
    let ready: serde_json::Value = serde_json::from_slice(&output).unwrap();
    let endpoint = std::path::PathBuf::from(ready["endpoint"].as_str().unwrap());
    assert_eq!(
        endpoint,
        beam_editor_engine::broker::endpoint_for(&root.path().join("project")).unwrap()
    );
    assert!(
        ready["grants"]["project"]
            .as_str()
            .is_some_and(|id| !id.is_empty())
    );
    assert_eq!(ready["grants"]["sources"].as_array().unwrap().len(), 1);
    assert!(!endpoint.exists());
    let mut input = std::io::Cursor::new(
        br#"{"jsonrpc":"2.0","id":1,"method":"ping"}
"#,
    );
    let mut output = Vec::new();
    assert_eq!(
        execute(Invocation::Mcp { endpoint }, &mut input, &mut output).unwrap(),
        0
    );
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&output).unwrap()["id"],
        1
    );
}
