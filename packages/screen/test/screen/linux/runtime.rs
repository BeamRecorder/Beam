#![cfg(test)]

use crate::CaptureError;

use super::portal_runtime;

#[test]
fn portal_runtime_reuses_the_same_instance() -> Result<(), CaptureError> {
    let first = portal_runtime()?;
    let second = portal_runtime()?;

    assert!(std::ptr::eq(first, second));
    Ok(())
}
