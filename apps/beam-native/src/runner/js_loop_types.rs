//! Event channels, reload inputs, and profiling counters for the QuickJS pump.

use super::RelayBatch;
use crate::{hot_reload::BundleWatcher, services::ServiceResponse};
use argui_runtime::NativeHostDelivery;
use std::sync::mpsc::{Receiver, Sender};
#[cfg(any(debug_assertions, feature = "dev-metrics"))]
use std::time::Duration;

/// Development bundle state owned by the QuickJS actor.
pub(super) struct ReloadControl<'a> {
    pub(super) watcher: Option<BundleWatcher>,
    pub(super) contract_json: &'a str,
    pub(super) sender: &'a Sender<RelayBatch>,
}

/// Native channels consumed by the QuickJS event pump.
pub(super) struct JsLoopInbox {
    pub(super) events: Receiver<NativeHostDelivery>,
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    pub(super) profiles: Receiver<String>,
    pub(super) errors: Receiver<String>,
    pub(super) stop: Receiver<()>,
    pub(super) services: Receiver<ServiceResponse>,
}

#[derive(Default)]
pub(super) struct LoopMetrics {
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    pub(super) work: Duration,
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    pub(super) ticks: u64,
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    pub(super) deliveries: u64,
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    pub(super) window_deliveries: u64,
}
