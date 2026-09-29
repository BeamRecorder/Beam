//! Durable, bounded document change history; imports are events without receipts.
use crate::protocol::Event;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EventJournal {
    /// Cursors older than this revision require a fresh state projection.
    pub after_revision: u64,
    pub entries: Vec<Event>,
}
