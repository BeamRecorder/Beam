#[test]
fn ready_output_contains_only_opaque_grants_and_transport_bootstrap() {
    let ready = beam_editor_cli::types::Ready {
        endpoint: "owner".into(),
        token_file: "owner.token".into(),
        grants: beam_editor_cli::types::ReadyGrants {
            project: "p".into(),
            sources: vec!["s".into()],
            destination: None,
        },
    };
    let value = serde_json::to_value(ready).unwrap();
    assert_eq!(value["tokenFile"], "owner.token");
    assert_eq!(value["grants"]["project"], "p");
    assert!(value["grants"].get("paths").is_none());
}
