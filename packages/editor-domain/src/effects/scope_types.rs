//! A definition declares every decision scope its processor can implement.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ScopeTarget {
    Clip,
    Track,
    Sequence,
}

pub fn clip_targets() -> Vec<ScopeTarget> {
    vec![ScopeTarget::Clip]
}

/// Keeping the legacy default absent preserves canonical hashes of existing packs.
pub fn is_clip_targets(targets: &[ScopeTarget]) -> bool {
    targets == [ScopeTarget::Clip]
}
