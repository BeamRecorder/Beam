//! Explicit MCP 2026 metadata and 2025 initialize lifecycle; no UI dependency.
use crate::{
    tools,
    types::{Action, ResultStyle, RpcMessage},
};
use beam_editor_domain::protocol::{ErrorCode, Request, Response};
use serde_json::{Value, json};

pub const MODERN: &str = "2026-07-28";
pub const INITIALIZED: &str = "2025-11-25";
const META_VERSION: &str = "io.modelcontextprotocol/protocolVersion";
const META_CAPABILITIES: &str = "io.modelcontextprotocol/clientCapabilities";
pub const SUBSCRIPTION_ID: &str = "io.modelcontextprotocol/subscriptionId";

#[derive(Default)]
pub struct Server {
    initializing: bool,
    initialized: bool,
}

pub fn failure(id: Value, code: i32, message: &str) -> Value {
    json!({"jsonrpc":"2.0", "id":id, "error":{"code":code,"message":message}})
}
pub fn result(id: Value, mut value: Value, modern: bool) -> Value {
    if modern {
        value["resultType"] = json!("complete");
        value["_meta"]["io.modelcontextprotocol/serverInfo"] = identity();
    }
    json!({"jsonrpc":"2.0", "id":id, "result":value})
}
fn identity() -> Value {
    json!({"name":"beam-editor", "version":env!("CARGO_PKG_VERSION")})
}
fn capabilities(modern: bool) -> Value {
    json!({"tools":{}, "resources":{"subscribe":modern}})
}
pub fn resource_request(uri: &str) -> Option<Request> {
    crate::resources::request(uri)
}

impl Server {
    pub fn prepare(&mut self, bytes: &[u8]) -> Action {
        let raw: Value = match serde_json::from_slice(bytes) {
            Ok(value) => value,
            Err(_) => return Action::Reply(failure(Value::Null, -32700, "Invalid JSON")),
        };
        let id = raw.get("id").cloned().unwrap_or(Value::Null);
        let has_id = raw.get("id").is_some();
        let message: RpcMessage = match serde_json::from_value(raw) {
            Ok(value) => value,
            Err(_) => return Action::Reply(failure(id, -32600, "Invalid JSON-RPC request")),
        };
        if message.jsonrpc != "2.0"
            || (has_id && !(id.is_string() || id.as_i64().is_some() || id.as_u64().is_some()))
        {
            return Action::Reply(failure(
                id,
                -32600,
                "JSON-RPC 2.0 and a non-null string/integer id are required",
            ));
        }
        if !has_id {
            return match message.method.as_str() {
                "notifications/initialized" if self.initializing => {
                    self.initialized = true;
                    Action::Ignore
                }
                "notifications/cancelled" => message
                    .params
                    .get("requestId")
                    .cloned()
                    .map(|id| Action::Cancel { id })
                    .unwrap_or(Action::Ignore),
                _ => Action::Ignore,
            };
        }
        if message.method == "initialize" {
            if self.initializing {
                return Action::Reply(failure(id, -32600, "Session is already initialized"));
            }
            if message.params["protocolVersion"] != INITIALIZED
                || !message.params["capabilities"].is_object()
                || !message.params["clientInfo"].is_object()
            {
                return Action::Reply(failure(
                    id,
                    -32602,
                    "initialize supports 2025-11-25 with clientInfo and capabilities; modern clients use server/discover",
                ));
            }
            self.initializing = true;
            return Action::Reply(result(
                id,
                json!({"protocolVersion":INITIALIZED,"capabilities":capabilities(false),"serverInfo":identity()}),
                false,
            ));
        }
        let metadata = &message.params["_meta"];
        let modern = metadata.get(META_VERSION).is_some();
        if modern {
            let Some(version) = metadata[META_VERSION].as_str() else {
                return Action::Reply(failure(
                    id,
                    -32602,
                    "protocolVersion metadata must be a string",
                ));
            };
            if version != MODERN {
                let mut error = failure(id, -32022, "Unsupported protocol version");
                error["error"]["data"] =
                    json!({"supported":[MODERN,INITIALIZED], "requested":version});
                return Action::Reply(error);
            }
            if !metadata[META_CAPABILITIES].is_object() {
                return Action::Reply(failure(
                    id,
                    -32602,
                    "clientCapabilities metadata is required",
                ));
            }
        } else if !self.initialized && message.method != "ping" {
            return Action::Reply(failure(
                id,
                -32602,
                "Use modern per-request metadata or complete initialize/notifications/initialized",
            ));
        }
        match message.method.as_str() {
            "server/discover" if modern => Action::Reply(result(
                id,
                json!({"supportedVersions":[MODERN,INITIALIZED],"capabilities":capabilities(true)}),
                true,
            )),
            "ping" => Action::Reply(result(id, json!({}), modern)),
            "tools/list" => {
                if message.params.get("cursor").is_some() {
                    return Action::Reply(failure(
                        id,
                        -32602,
                        "The tool catalog has one page; cursor is invalid",
                    ));
                }
                match tools::tools() {
                    Ok(tools) => Action::Reply(result(id, json!({"tools":tools}), modern)),
                    Err(error) => Action::Reply(failure(id, -32603, &error.to_string())),
                }
            }
            "tools/call" => {
                let name = message.params["name"].as_str().unwrap_or("");
                match tools::request(
                    name,
                    message
                        .params
                        .get("arguments")
                        .cloned()
                        .unwrap_or_else(|| json!({})),
                ) {
                    Ok(request) => Action::Service {
                        id,
                        modern,
                        request,
                        style: ResultStyle::Tool,
                    },
                    Err(error) => Action::Reply(failure(id, -32602, &error.to_string())),
                }
            }
            "resources/list" => {
                if message.params.get("cursor").is_some() {
                    return Action::Reply(failure(
                        id,
                        -32602,
                        "The resource catalog has one page; cursor is invalid",
                    ));
                }
                Action::Reply(result(id, crate::resources::list(), modern))
            }
            "resources/templates/list" => {
                if message.params.get("cursor").is_some() {
                    return Action::Reply(failure(
                        id,
                        -32602,
                        "The template catalog has one page; cursor is invalid",
                    ));
                }
                Action::Reply(result(id, crate::resources::templates(), modern))
            }
            "resources/read" => {
                let uri = message.params["uri"].as_str().unwrap_or("");
                match resource_request(uri) {
                    Some(request) => Action::Service {
                        id,
                        modern,
                        request,
                        style: ResultStyle::Resource { uri: uri.into() },
                    },
                    None => Action::Reply(failure(id, -32602, "Unknown resource URI")),
                }
            }
            "subscriptions/listen" if modern => {
                let uris = message.params["notifications"]["resourceSubscriptions"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default();
                let Some(uris) = uris
                    .iter()
                    .map(|uri| uri.as_str().map(String::from))
                    .collect::<Option<Vec<_>>>()
                else {
                    return Action::Reply(failure(
                        id,
                        -32602,
                        "resourceSubscriptions must contain URI strings",
                    ));
                };
                if uris.iter().any(|uri| resource_request(uri).is_none()) {
                    return Action::Reply(failure(id, -32602, "Unknown subscription resource"));
                }
                Action::Subscribe { id, uris }
            }
            // Legacy subscriptions are deliberately omitted; current clients use subscriptions/listen.
            _ => Action::Reply(failure(id, -32601, "Unknown or unsupported method")),
        }
    }
}

pub fn service_result(id: Value, response: Response, style: ResultStyle, modern: bool) -> Value {
    let is_error = matches!(response, Response::Error { .. });
    let resource_error = if matches!(&response, Response::Error { error } if matches!(error.code, ErrorCode::InvalidRequest))
    {
        -32602
    } else {
        -32603
    };
    let value = match serde_json::to_value(response) {
        Ok(value) => value,
        Err(error) => return failure(id, -32603, &error.to_string()),
    };
    let text = value.to_string();
    match style {
        ResultStyle::Tool => result(
            id,
            json!({"content":[{"type":"text","text":text}],"structuredContent":value,"isError":is_error}),
            modern,
        ),
        ResultStyle::Resource { uri } if !is_error => result(
            id,
            json!({"contents":[{"uri":uri,"mimeType":"application/json","text":text}]}),
            modern,
        ),
        ResultStyle::Resource { .. } => failure(
            id,
            resource_error,
            value["error"]["message"]
                .as_str()
                .unwrap_or("Resource unavailable"),
        ),
    }
}
