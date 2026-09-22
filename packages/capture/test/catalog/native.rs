#![cfg(test)]

use super::should_offer_portal_source;

#[test]
fn transient_portal_probe_failures_keep_an_optimistic_source_available() {
    assert!(should_offer_portal_source(false, false));
}

#[test]
fn successful_portal_probes_keep_reported_source_types_exact() {
    assert!(should_offer_portal_source(true, true));
    assert!(!should_offer_portal_source(true, false));
}
