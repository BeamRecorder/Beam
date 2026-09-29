//! Exact, JavaScript-safe time and explicit coordinate spaces.
use serde::{Deserialize, Serialize};

pub const MAX_TICKS: i64 = 9_007_199_254_740_991;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Time {
    pub ticks: i64,
    pub timescale: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FrameRate {
    pub numerator: u32,
    pub denominator: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum TimeSpace {
    Source,
    ClipLocal,
    Sequence,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimeRange {
    pub space: TimeSpace,
    pub start: Time,
    pub end: Time,
}

/// Source seconds consumed for each sequence second. Positive rational speed.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Rate {
    pub numerator: u32,
    pub denominator: u32,
}
impl Default for Rate {
    fn default() -> Self {
        Self {
            numerator: 1,
            denominator: 1,
        }
    }
}
