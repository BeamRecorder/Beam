use serde::{Deserialize, Serialize};
use std::time::Duration;

use super::NativeInputEvent;

pub const INPUT_HEARTBEAT_INTERVAL: Duration = Duration::from_millis(500);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "kebab-case")]
pub enum InputHelperHeartbeat {
    Heartbeat,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(untagged)]
pub enum InputHelperMessage {
    Event(NativeInputEvent),
    Heartbeat(InputHelperHeartbeat),
}

#[cfg(test)]
#[path = "helper_protocol_tests.rs"]
mod tests;
