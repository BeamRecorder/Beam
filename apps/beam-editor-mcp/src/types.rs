use beam_editor_domain::{
    Result,
    protocol::{Request, Response},
};
use serde::Deserialize;
use serde_json::Value;
use std::sync::{Arc, atomic::AtomicBool};

pub type Executor = Arc<dyn Fn(Request) -> Result<Response> + Send + Sync>;
pub type Pending = Arc<std::sync::Mutex<std::collections::HashMap<String, Arc<AtomicBool>>>>;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RpcMessage {
    pub jsonrpc: String,
    #[serde(default)]
    pub id: Option<Value>,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}
#[derive(Clone)]
pub enum ResultStyle {
    Tool,
    Resource { uri: String },
}
pub enum Action {
    Reply(Value),
    Service {
        id: Value,
        modern: bool,
        request: Request,
        style: ResultStyle,
    },
    Subscribe {
        id: Value,
        uris: Vec<String>,
    },
    Cancel {
        id: Value,
    },
    Ignore,
}
