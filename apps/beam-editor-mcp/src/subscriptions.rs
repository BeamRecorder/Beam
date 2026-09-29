//! Watch only explicitly subscribed resources; idle connections do no polling.
use crate::{
    server::{SUBSCRIPTION_ID, resource_request},
    types::Executor,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

pub fn watch(
    id: Value,
    uris: Vec<String>,
    executor: Executor,
    cancelled: Arc<AtomicBool>,
    mut emit: impl FnMut(Value),
) {
    emit(
        json!({"jsonrpc":"2.0", "method":"notifications/subscriptions/acknowledged", "params":{
            "_meta":{SUBSCRIPTION_ID:id}, "notifications":{"resourceSubscriptions":uris}
        }}),
    );
    let mut previous = HashMap::new();
    while !cancelled.load(Ordering::Acquire) {
        for uri in &uris {
            if cancelled.load(Ordering::Acquire) {
                return;
            }
            let Some(request) = resource_request(uri) else {
                continue;
            };
            let response = executor(request);
            let fingerprint = match response {
                Ok(beam_editor_domain::protocol::Response::Project { project }) => {
                    project.revision.to_string()
                }
                Ok(beam_editor_domain::protocol::Response::Definitions { page }) => {
                    page.revision.to_string()
                }
                Ok(beam_editor_domain::protocol::Response::Job { job }) => {
                    let Ok(value) = serde_json::to_string(&job) else {
                        continue;
                    };
                    value
                }
                Ok(beam_editor_domain::protocol::Response::Jobs { page }) => {
                    let Ok(value) = serde_json::to_string(&page) else {
                        continue;
                    };
                    value
                }
                Ok(beam_editor_domain::protocol::Response::Artifacts { page }) => {
                    let Ok(value) = serde_json::to_string(&page) else {
                        continue;
                    };
                    value
                }
                _ => continue,
            };
            let changed = previous.get(uri).is_some_and(|old| old != &fingerprint);
            previous.insert(uri.clone(), fingerprint);
            if changed {
                emit(
                    json!({"jsonrpc":"2.0", "method":"notifications/resources/updated", "params":{
                        "_meta":{SUBSCRIPTION_ID:id}, "uri":uri
                    }}),
                );
            }
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}
