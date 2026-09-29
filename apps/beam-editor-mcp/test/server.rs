use beam_editor_domain::protocol::{ErrorCode, Response, ServiceError};
use beam_editor_mcp::{
    server::{Server, service_result},
    types::{Action, ResultStyle},
};
use serde_json::{Value, json};
fn modern(method: &str, mut params: Value) -> Vec<u8> {
    params["_meta"] = json!({"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}});
    serde_json::to_vec(&json!({"jsonrpc":"2.0","id":1,"method":method,"params":params})).unwrap()
}
fn reply(action: Action) -> Value {
    match action {
        Action::Reply(value) => value,
        _ => panic!("expected reply"),
    }
}
#[test]
fn discovery_and_metadata_are_stateless_and_versioned() {
    let result = reply(Server::default().prepare(&modern("server/discover", json!({}))));
    assert_eq!(result["result"]["supportedVersions"][0], "2026-07-28");
    assert_eq!(result["result"]["resultType"], "complete");
    assert!(result["result"]["_meta"]["io.modelcontextprotocol/serverInfo"].is_object());
    let unsupported = json!({"jsonrpc":"2.0","id":"a","method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2100-01-01","io.modelcontextprotocol/clientCapabilities":{}}}});
    assert_eq!(
        reply(Server::default().prepare(&serde_json::to_vec(&unsupported).unwrap()))["error"]["code"],
        -32022
    );
    let missing = json!({"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}});
    assert_eq!(
        reply(Server::default().prepare(&serde_json::to_vec(&missing).unwrap()))["error"]["code"],
        -32602
    );
}
#[test]
fn initialize_requires_legacy_version_and_initialized_notification() {
    let mut server = Server::default();
    let initialize = json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1"}}});
    assert_eq!(
        reply(server.prepare(&serde_json::to_vec(&initialize).unwrap()))["result"]["protocolVersion"],
        "2025-11-25"
    );
    assert_eq!(
        reply(server.prepare(br#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#))["error"]["code"],
        -32602
    );
    assert!(matches!(
        server.prepare(br#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#),
        Action::Ignore
    ));
    assert!(reply(server.prepare(br#"{"jsonrpc":"2.0","id":3,"method":"tools/list"}"#))["result"]["tools"].is_array());
    assert_eq!(
        reply(server.prepare(&serde_json::to_vec(&initialize).unwrap()))["error"]["code"],
        -32600
    );
    let mut invalid = initialize;
    invalid["params"]["protocolVersion"] = json!("2026-07-28");
    assert!(
        reply(Server::default().prepare(&serde_json::to_vec(&invalid).unwrap()))["error"]
            .is_object()
    );
}
#[test]
fn malformed_protocol_and_notifications_never_reach_domain() {
    for value in [
        json!({"jsonrpc":"1.0","id":1,"method":"ping"}),
        json!({"jsonrpc":"2.0","id":null,"method":"ping"}),
        json!({"jsonrpc":"2.0","id":[],"method":"ping"}),
        json!({"jsonrpc":"2.0","id":1.1,"method":"ping"}),
        json!({"jsonrpc":"2.0","id":1,"method":"ping","extra":1}),
    ] {
        assert_eq!(
            reply(Server::default().prepare(&serde_json::to_vec(&value).unwrap()))["error"]["code"],
            -32600
        );
    }
    assert!(matches!(
        Server::default().prepare(br#"{"jsonrpc":"2.0","method":"unknown"}"#),
        Action::Ignore
    ));
    assert!(
        matches!(Server::default().prepare(br#"{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":8}}"#),Action::Cancel{id} if id==8)
    );
    assert!(matches!(
        Server::default().prepare(br#"{"jsonrpc":"2.0","method":"notifications/cancelled"}"#),
        Action::Ignore
    ));
}
#[test]
fn tools_resources_and_subscriptions_have_valid_routes() {
    let mut server = Server::default();
    assert!(reply(server.prepare(&modern("tools/list", json!({}))))["result"]["tools"].is_array());
    assert!(matches!(
        server.prepare(&modern(
            "tools/call",
            json!({"name":"beam_discovery","arguments":{}})
        )),
        Action::Service { .. }
    ));
    assert!(
        reply(server.prepare(&modern("tools/call", json!({"name":"unknown"}))))["error"]
            .is_object()
    );
    assert_eq!(
        reply(server.prepare(&modern("resources/list", json!({}))))["result"]["resources"]
            .as_array()
            .unwrap()
            .len(),
        4
    );
    assert!(matches!(
        server.prepare(&modern("resources/read", json!({"uri":"beam://project"}))),
        Action::Service { .. }
    ));
    for (method, params) in [
        ("tools/list", json!({"cursor":"bad"})),
        ("resources/list", json!({"cursor":"bad"})),
        ("resources/read", json!({"uri":"file:///etc/passwd"})),
        ("unknown", json!({})),
        (
            "subscriptions/listen",
            json!({"notifications":{"resourceSubscriptions":[1]}}),
        ),
        (
            "subscriptions/listen",
            json!({"notifications":{"resourceSubscriptions":["bad"]}}),
        ),
    ] {
        assert!(reply(server.prepare(&modern(method, params)))["error"].is_object());
    }
    assert!(
        matches!(server.prepare(&modern("subscriptions/listen",json!({"notifications":{"resourceSubscriptions":["beam://project"]}}))),Action::Subscribe{uris,..} if uris.len()==1)
    );
}
#[test]
fn tool_errors_are_structured_while_resources_return_text() {
    let error = Response::Error {
        error: ServiceError {
            code: ErrorCode::Unauthorized,
            message: "revoked grant".into(),
            expected_revision: None,
            actual_revision: None,
        },
    };
    let result = service_result(json!(1), error.clone(), ResultStyle::Tool, true);
    assert_eq!(result["result"]["isError"], true);
    assert_eq!(
        result["result"]["structuredContent"]["error"]["code"],
        "unauthorized"
    );
    assert_eq!(
        service_result(
            json!(2),
            error,
            ResultStyle::Resource {
                uri: "beam://project".into()
            },
            true
        )["error"]["code"],
        -32603
    );
    let result = service_result(
        json!(3),
        Response::Acknowledged,
        ResultStyle::Resource {
            uri: "beam://project".into(),
        },
        false,
    );
    assert_eq!(
        result["result"]["contents"][0]["mimeType"],
        "application/json"
    );
}

#[test]
fn missing_or_invalid_resource_targets_use_invalid_params_errors() {
    let response = Response::Error {
        error: ServiceError {
            code: ErrorCode::InvalidRequest,
            message: "Artifact not found".into(),
            expected_revision: None,
            actual_revision: None,
        },
    };
    assert_eq!(
        service_result(
            json!(1),
            response,
            ResultStyle::Resource {
                uri: "beam://artifacts/missing".into()
            },
            true
        )["error"]["code"],
        -32602
    );
}
