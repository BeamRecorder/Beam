#[cfg(windows)]
#[test]
fn named_pipe_endpoints_are_local_and_scoped_to_the_project() {
    let root = tempfile::tempdir().unwrap();
    let endpoint = beam_editor_engine::broker::endpoint_for(root.path()).unwrap();
    assert!(
        endpoint
            .to_string_lossy()
            .starts_with(r"\\.\pipe\beam-editor-")
    );
    assert!(
        !beam_editor_engine::broker::token_file(&endpoint)
            .to_string_lossy()
            .starts_with(r"\\.\pipe")
    );
}
