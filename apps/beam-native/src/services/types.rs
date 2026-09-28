//! Typed request and response envelopes for the QuickJS application services.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

pub(super) const MAX_SERVICE_BYTES: usize = 64 * 1024;
pub(super) const MAX_SCRIPT_SERVICE_BYTES: usize = 128 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ServiceRequest {
    pub request_id: u64,
    pub window: String,
    pub service: String,
    pub method: String,
    #[serde(default)]
    pub payload: Value,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Cancellation {
    pub request_id: u64,
    pub window: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ServiceReply<'a> {
    pub request_id: u64,
    pub window: &'a str,
    #[serde(flatten)]
    pub outcome: ReplyOutcome<'a>,
}
#[derive(Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub(super) enum ReplyOutcome<'a> {
    Ok { value: &'a Value },
    Cancelled,
    Event { value: &'a Value },
    Unsupported { message: &'a str },
    Error { message: &'a str },
}
#[derive(Serialize)]
pub(super) struct FileReference {
    pub path: PathBuf,
    pub name: String,
}
