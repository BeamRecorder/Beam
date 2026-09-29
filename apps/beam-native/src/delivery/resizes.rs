//! Removes obsolete sizes before a scene computes responsive layout.

use crate::services::{ServiceOutcome, ServiceResponse};
use serde_json::Value;

/// Keeps the latest consecutive physical resize in `responses` for each owning scene.
/// Returns FIFO responses with replies, visibility, and DPI changes preserved as boundaries.
pub fn coalesce_window_resizes(responses: Vec<ServiceResponse>) -> Vec<ServiceResponse> {
    let mut retained: Vec<ServiceResponse> = Vec::with_capacity(responses.len());
    for response in responses {
        let replace = physical_resize(&response)
            && retained.last().is_some_and(|previous| {
                previous.session == response.session
                    && previous.window == response.window
                    && physical_resize(previous)
            });
        if replace {
            *retained.last_mut().expect("previous response exists") = response;
        } else {
            retained.push(response);
        }
    }
    retained
}

/// Returns whether `response` carries only a replaceable physical size event.
fn physical_resize(response: &ServiceResponse) -> bool {
    let ServiceOutcome::Event(value) = &response.outcome else {
        return false;
    };
    response.request_id == 0
        && value.get("type").and_then(Value::as_str) == Some("windowResized")
        && value.get("physicalWidth").and_then(Value::as_u64).is_some()
        && value
            .get("physicalHeight")
            .and_then(Value::as_u64)
            .is_some()
        && value.get("scaleFactor").is_none_or(Value::is_null)
}
