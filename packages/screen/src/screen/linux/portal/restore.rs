//! One-use ScreenCast grants, retained only for the running application.

use crate::model::PortalSourceKind;
use std::{collections::BTreeMap, sync::Mutex};

static TOKENS: Mutex<BTreeMap<u8, String>> = Mutex::new(BTreeMap::new());

/// Consumes the previous grant for `kind`; the portal invalidates it after use.
pub(super) fn take(kind: &PortalSourceKind) -> Option<String> {
    TOKENS
        .lock()
        .unwrap_or_else(|poison| poison.into_inner())
        .remove(&key(kind))
}

/// Replaces the consumed grant with the new token returned by ScreenCast.Start.
pub(super) fn remember(kind: &PortalSourceKind, token: &str) {
    TOKENS
        .lock()
        .unwrap_or_else(|poison| poison.into_inner())
        .insert(key(kind), token.to_owned());
}

/// Keeps monitor and window permissions independent.
fn key(kind: &PortalSourceKind) -> u8 {
    match kind {
        PortalSourceKind::Monitor => 0,
        PortalSourceKind::Window => 1,
        PortalSourceKind::MonitorOrWindow => 2,
    }
}
