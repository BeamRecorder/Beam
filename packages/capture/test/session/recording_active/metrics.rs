#![cfg(test)]

use super::samplers;
use crate::session::recording_active::ActiveRecordings;

#[test]
fn no_recordings_produce_no_metric_samplers() {
    assert!(samplers(&ActiveRecordings::default(), &[]).is_empty());
}
