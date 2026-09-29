use beam_editor_domain::protocol::Request;
use beam_editor_mcp::tools;
use serde_json::json;
#[test]
fn schemas_are_generated_and_methods_are_hidden_from_arguments() {
    let tools = tools::tools().unwrap();
    assert!(tools.len() >= 15);
    assert!(
        tools
            .iter()
            .all(|tool| tool["name"] != "beam_artifact_read")
    );
    for tool in &tools {
        assert_eq!(
            tool["inputSchema"]["$schema"],
            "http://json-schema.org/draft-07/schema#"
        );
        assert!(tool["inputSchema"]["properties"].get("method").is_none());
        assert!(tool["outputSchema"]["definitions"]["Response"].is_object());
    }
    assert!(
        tools
            .windows(2)
            .all(|pair| pair[0]["name"].as_str() < pair[1]["name"].as_str())
    );
    let transaction = tools
        .iter()
        .find(|tool| tool["name"] == "beam_transaction")
        .unwrap();
    assert_eq!(transaction["annotations"]["destructiveHint"], true);
    let validation = tools
        .iter()
        .find(|tool| tool["name"] == "beam_validate_transaction")
        .unwrap();
    assert_eq!(validation["annotations"]["readOnlyHint"], true);
    assert_eq!(validation["annotations"]["destructiveHint"], false);
    let sealing = tools
        .iter()
        .find(|tool| tool["name"] == "beam_seal_pack")
        .unwrap();
    assert_eq!(sealing["annotations"]["readOnlyHint"], true);
    assert!(sealing["inputSchema"]["definitions"]["Preset"].is_object());
    let maintenance = tools
        .iter()
        .find(|tool| tool["name"] == "beam_garbage_collect")
        .unwrap();
    assert_eq!(maintenance["annotations"]["readOnlyHint"], false);
    assert_eq!(maintenance["annotations"]["destructiveHint"], true);
    assert!(
        maintenance["inputSchema"]["properties"]
            .get("projectId")
            .is_some()
    );
    assert!(
        maintenance["inputSchema"]["properties"]
            .get("expectedRevision")
            .is_some()
    );
    let relink = tools
        .iter()
        .find(|tool| tool["name"] == "beam_relink")
        .unwrap();
    assert_eq!(relink["annotations"]["destructiveHint"], true);
    assert!(
        relink["inputSchema"]["properties"]
            .get("sourceGrant")
            .is_some()
    );
    assert!(relink["inputSchema"]["properties"].get("path").is_none());
    let import = tools
        .iter()
        .find(|tool| tool["name"] == "beam_import")
        .unwrap();
    assert!(
        import["inputSchema"]["required"]
            .as_array()
            .unwrap()
            .iter()
            .any(|key| key == "context")
    );
    for name in ["beam_analysis_start", "beam_proxy_start"] {
        let tool = tools.iter().find(|tool| tool["name"] == name).unwrap();
        assert_eq!(tool["annotations"]["readOnlyHint"], false);
        assert_eq!(tool["annotations"]["destructiveHint"], false);
        assert!(tool["inputSchema"]["definitions"]["SourceContext"].is_object());
    }
}
#[test]
fn tools_decode_same_request_type_and_reject_unknown_arguments() {
    assert!(matches!(
        tools::request("beam_validate_transaction", json!({"transaction":{}})),
        Err(_)
    ));
    assert!(matches!(
        tools::request("beam_discovery", json!({})).unwrap(),
        Request::Discovery
    ));
    assert!(tools::request("unknown", json!({})).is_err());
    assert!(tools::request("beam_artifact_read", json!({})).is_err());
    assert!(tools::request("beam_discovery", json!([])).is_err());
    assert!(tools::request("beam_discovery", json!({"method":"query"})).is_err());
    assert!(tools::request("beam_import", json!({"paths":["/etc/passwd"]})).is_err());
    let context = json!({"projectId":"00000000-0000-4000-8000-000000000001","assetId":"00000000-0000-4000-8000-000000000002","expectedRevision":0,"idempotencyKey":"source-job"});
    assert!(matches!(
        tools::request(
            "beam_analysis_start",
            json!({"context":context,"algorithm":"zoomClicksV1"})
        )
        .unwrap(),
        Request::AnalysisStart { .. }
    ));
    assert!(matches!(tools::request("beam_proxy_start",json!({"context":context,"settings":{"container":"webm","width":128,"height":96,"frameRate":{"numerator":30,"denominator":1}}})).unwrap(),Request::ProxyStart{..}));
    assert!(
        tools::request(
            "beam_analysis_start",
            json!({"context":context,"algorithm":"fake"})
        )
        .is_err()
    );
    assert!(
        tools::request(
            "beam_proxy_start",
            json!({"context":context,"path":"/private"})
        )
        .is_err()
    );
    assert!(matches!(
        tools::request(
            "beam_garbage_collect",
            json!({"projectId":"00000000-0000-4000-8000-000000000001","expectedRevision":4})
        )
        .unwrap(),
        Request::GarbageCollect {
            expected_revision: 4,
            ..
        }
    ));
}

#[test]
fn generated_query_tools_keep_header_pages_and_real_scope_addresses() {
    let tools = tools::tools().unwrap();
    let query = tools
        .iter()
        .find(|tool| tool["name"] == "beam_query")
        .unwrap();
    assert_eq!(query["annotations"]["readOnlyHint"], true);
    assert!(query["inputSchema"]["definitions"]["ReadTarget"].is_object());
    let id = "00000000-0000-4000-8000-000000000001";
    for target in [
        json!({"kind":"clip","sequenceId":id,"clipId":id}),
        json!({"kind":"track","sequenceId":id,"trackId":id}),
        json!({"kind":"sequence","sequenceId":id}),
    ] {
        assert!(matches!(tools::request("beam_query",json!({"query":{"kind":"scopedParameterValues","target":target,"time":{"ticks":0,"timescale":1000}}})).unwrap(),Request::Query{..}));
    }
    assert!(matches!(
        tools::request(
            "beam_query",
            json!({"query":{"kind":"clipHeaders","sequenceId":id,"offset":0,"limit":256}})
        )
        .unwrap(),
        Request::Query { .. }
    ));
    assert!(tools::request("beam_query",json!({"query":{"kind":"scopedParameterValues","target":{"kind":"track","sequenceId":id,"clipId":id},"time":{"ticks":0,"timescale":1000}}})).is_err());
}

#[test]
fn async_import_is_a_generated_native_job_tool_with_required_context_and_grants() {
    let tools = tools::tools().unwrap();
    let tool = tools
        .iter()
        .find(|tool| tool["name"] == "beam_import_start")
        .unwrap();
    assert_eq!(tool["annotations"]["readOnlyHint"], false);
    let id = "00000000-0000-4000-8000-000000000001";
    let context =
        json!({"projectId":id,"sequenceId":id,"expectedRevision":0,"idempotencyKey":"import-job"});
    assert!(matches!(
        tools::request(
            "beam_import_start",
            json!({"context":context,"sourceGrants":["one"]})
        )
        .unwrap(),
        Request::ImportStart { .. }
    ));
    assert!(tools::request("beam_import_start", json!({"sourceGrants":["one"]})).is_err());
    assert!(
        tools::request(
            "beam_import_start",
            json!({"context":context,"paths":["/private"]})
        )
        .is_err()
    );
}
