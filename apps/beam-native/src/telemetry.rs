//! Bounded JavaScript comparison counters.

#[cfg(any(debug_assertions, feature = "dev-metrics"))]
use std::sync::atomic::Ordering;
use std::sync::{Arc, atomic::AtomicU64};
#[cfg(any(debug_assertions, feature = "dev-metrics"))]
use std::time::Duration;

/// Counters separating one-time mount work from live JavaScript transactions.
pub(crate) struct JsCounts {
    pub(crate) batches: Arc<AtomicU64>,
    pub(crate) operations: Arc<AtomicU64>,
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    startup_batches: u64,
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    startup_operations: u64,
}

impl JsCounts {
    /// Captures shared counters and their values after Animation Lab startup.
    /// `batches` and `operations` count emitted native transactions and operations.
    /// Returns a snapshot used to report work after the scene is ready.
    pub(crate) fn new(batches: Arc<AtomicU64>, operations: Arc<AtomicU64>) -> Self {
        #[cfg(any(debug_assertions, feature = "dev-metrics"))]
        let startup_batches = batches.load(Ordering::Relaxed);
        #[cfg(any(debug_assertions, feature = "dev-metrics"))]
        let startup_operations = operations.load(Ordering::Relaxed);
        Self {
            batches,
            operations,
            #[cfg(any(debug_assertions, feature = "dev-metrics"))]
            startup_batches,
            #[cfg(any(debug_assertions, feature = "dev-metrics"))]
            startup_operations,
        }
    }

    /// Returns the one-time mount and navigation counts.
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    pub(crate) fn startup(&self) -> (u64, u64) {
        (self.startup_batches, self.startup_operations)
    }

    /// Reports cumulative post-startup transactions and JavaScript work.
    /// `deliveries` and `ticks` count live callbacks and scheduler iterations;
    /// `work` is time in QuickJS APIs, and `elapsed` is the full actor interval.
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    pub(crate) fn report(&self, deliveries: u64, ticks: u64, work: Duration, elapsed: Duration) {
        let batches = self.batches.load(Ordering::Relaxed);
        let operations = self.operations.load(Ordering::Relaxed);
        eprintln!(
            "argui-comparison js_batches_after_startup={} js_operations_after_startup={} js_deliveries={} js_ticks={} js_work_ms={:.3} elapsed_ms={:.3}",
            batches.saturating_sub(self.startup_batches),
            operations.saturating_sub(self.startup_operations),
            deliveries,
            ticks,
            work.as_secs_f64() * 1000.0,
            elapsed.as_secs_f64() * 1000.0,
        );
    }
}

#[cfg(any(debug_assertions, feature = "dev-metrics"))]
mod profile;
#[cfg(any(debug_assertions, feature = "dev-metrics"))]
pub(crate) use profile::{
    ProfileSummary, mark_commit_for_presentation, observe_profile, report_remaining,
};
