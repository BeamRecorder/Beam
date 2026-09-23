use serde::{Deserialize, Serialize};

use super::{TrackId, TrackMetrics};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "event",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum HealthEvent {
    TrackHealth {
        track_id: TrackId,
        session_ns: u64,
        metrics: TrackMetrics,
    },
    Discontinuity {
        track_id: TrackId,
        session_ns: u64,
        lost_units: u64,
        reason: String,
    },
    DeviceChanged {
        track_id: TrackId,
        session_ns: u64,
        detail: String,
    },
    Warning {
        session_ns: u64,
        message: String,
    },
    Error {
        track_id: Option<TrackId>,
        session_ns: u64,
        code: String,
        message: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimingAnchor {
    pub track_id: TrackId,
    pub session_ns: u64,
    pub native_position: u64,
    pub native_rate: u64,
}
