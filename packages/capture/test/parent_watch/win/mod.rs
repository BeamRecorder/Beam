#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;

#[test]
fn current_process_has_a_queryable_creation_identity() {
    let created = creation_time(unsafe { GetCurrentProcess() }).expect("process creation time");
    assert!(created > 0);
}
