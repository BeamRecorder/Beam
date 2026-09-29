#[test]
fn rpc_model_rejects_unknown_top_level_fields() {
    assert!(
        serde_json::from_str::<beam_editor_mcp::types::RpcMessage>(
            r#"{"jsonrpc":"2.0","id":1,"method":"ping","path":".."}"#
        )
        .is_err()
    );
}
